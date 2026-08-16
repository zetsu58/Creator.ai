import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, databaseConfigured, databaseHealth } from './db.js';
import { issueSession, sessionsConfigured, verifySession } from './session.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '4mb' }));

const startedAt = Date.now();
const requireAuth = String(process.env.VEYRA_REQUIRE_AUTH || 'false').toLowerCase() === 'true';

type Plan = 'free'|'pro'|'business';
type MemUser = { id:string; externalAuthId?:string; plan:Plan; credits:number; deletedAt?:string };
const memUsers = new Map<string, MemUser>();
const memLedger: any[] = [];
const memJobs = new Map<string, any>();
const memReports: any[] = [];
const memPurchases = new Map<string, any>();

const creditProducts = [
  { id:'veyra_credits_250', credits:250, title:'Starter', badge:null },
  { id:'veyra_credits_700', credits:700, title:'Creator', badge:'Popular' },
  { id:'veyra_credits_1600', credits:1600, title:'Pro Pack', badge:'Best value' },
  { id:'veyra_credits_4000', credits:4000, title:'Studio', badge:null },
];

const bearer = (req: express.Request) => req.header('authorization')?.replace(/^Bearer\s+/i,'') ?? '';
const safeEqual = (a:string,b:string) => {
  const aa=Buffer.from(a); const bb=Buffer.from(b);
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
};

function canAccess(req: express.Request, userId:string) {
  if (!requireAuth) return true;
  const session = verifySession(bearer(req));
  return session?.userId === userId;
}

const adminGuard: express.RequestHandler = (req,res,next) => {
  const expected=process.env.VEYRA_ADMIN_TOKEN ?? '';
  const supplied=req.header('x-admin-token') ?? bearer(req);
  if (!expected || !safeEqual(expected,supplied)) return res.status(401).json({error:'unauthorized'});
  next();
};

function memEnsureUser(id:string) {
  if (!memUsers.has(id)) memUsers.set(id,{id,plan:'free',credits:100});
  const user=memUsers.get(id)!;
  if (user.deletedAt) throw new Error('account_deleted');
  return user;
}

async function dbEnsureUserById(id:string) {
  if (!pool) return null;
  const found=await pool.query('select id, plan, status, deleted_at from users where id=$1',[id]);
  if (!found.rowCount) return null;
  if (found.rows[0].status==='deleted') throw new Error('account_deleted');
  return found.rows[0];
}

async function createAnonymousUser(deviceKey:string) {
  const external=`anon:${crypto.createHash('sha256').update(deviceKey).digest('hex')}`;
  if (!pool) {
    const existing=[...memUsers.values()].find(u=>u.externalAuthId===external);
    if (existing) return existing;
    const id=crypto.randomUUID();
    const user:{id:string;externalAuthId:string;plan:Plan;credits:number}={id,externalAuthId:external,plan:'free',credits:100};
    memUsers.set(id,user);
    memLedger.push({id:crypto.randomUUID(),userId:id,delta:100,reason:'welcome_bonus',createdAt:new Date().toISOString(),bucket:'promo'});
    return user;
  }
  const client=await pool.connect();
  try {
    await client.query('begin');
    let r=await client.query('select id, plan, status from users where external_auth_id=$1 for update',[external]);
    if (!r.rowCount) {
      r=await client.query("insert into users(external_auth_id,plan,status) values($1,'free','active') returning id,plan,status",[external]);
      const id=r.rows[0].id;
      await client.query('insert into wallets(user_id,promo_credits) values($1,100)',[id]);
      await client.query("insert into credit_ledger(user_id,bucket,delta,reason,idempotency_key) values($1,'promo',100,'welcome_bonus',$2) on conflict do nothing",[id,`welcome:${id}`]);
    }
    await client.query('commit');
    return {id:r.rows[0].id,plan:r.rows[0].plan,credits:await dbWalletCredits(r.rows[0].id)};
  } catch(e) { await client.query('rollback'); throw e; } finally { client.release(); }
}

async function dbWalletCredits(userId:string) {
  if (!pool) return 0;
  const r=await pool.query('select purchased_credits,subscription_credits,promo_credits from wallets where user_id=$1',[userId]);
  if (!r.rowCount) return 0;
  const w=r.rows[0];
  return Number(w.purchased_credits)+Number(w.subscription_credits)+Number(w.promo_credits);
}

async function getWallet(userId:string) {
  if (!pool) { const u=memEnsureUser(userId); return {userId:u.id,plan:u.plan,credits:u.credits}; }
  const u=await dbEnsureUserById(userId); if(!u) throw new Error('not_found');
  return {userId:u.id,plan:u.plan,credits:await dbWalletCredits(userId)};
}

async function reserveDbCredits(userId:string,cost:number,jobId:string) {
  if (!pool) return {};
  const client=await pool.connect();
  try {
    await client.query('begin');
    const r=await client.query('select purchased_credits,subscription_credits,promo_credits from wallets where user_id=$1 for update',[userId]);
    if(!r.rowCount) throw new Error('wallet_not_found');
    const w=r.rows[0];
    const available=Number(w.purchased_credits)+Number(w.subscription_credits)+Number(w.promo_credits);
    if(available<cost) { const e:any=new Error('insufficient_credits'); e.available=available; throw e; }
    let left=cost;
    const take={promo:0,subscription:0,purchased:0};
    take.promo=Math.min(left,Number(w.promo_credits)); left-=take.promo;
    take.subscription=Math.min(left,Number(w.subscription_credits)); left-=take.subscription;
    take.purchased=Math.min(left,Number(w.purchased_credits)); left-=take.purchased;
    await client.query('update wallets set promo_credits=promo_credits-$2, subscription_credits=subscription_credits-$3, purchased_credits=purchased_credits-$4, updated_at=now() where user_id=$1',[userId,take.promo,take.subscription,take.purchased]);
    for (const [bucket,amount] of Object.entries(take)) if(amount>0) await client.query('insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,$2,$3,$4,$5,$6,$7)',[userId,bucket,-amount,'generation_reserved','generation',jobId,`reserve:${jobId}:${bucket}`]);
    await client.query('commit');
    return take;
  } catch(e) { await client.query('rollback'); throw e; } finally { client.release(); }
}

async function refundDbJob(job:any,reason='generation_failed_auto_refund') {
  if (!pool) return false;
  if (job.refunded_at || job.refundedAt) return false;
  const client=await pool.connect();
  try {
    await client.query('begin');
    const lock=await client.query('select id,user_id,credits_reserved,reservation_breakdown,refunded_at from generation_jobs where id=$1 for update',[job.id]);
    if(!lock.rowCount || lock.rows[0].refunded_at) { await client.query('rollback'); return false; }
    const row=lock.rows[0]; const b=row.reservation_breakdown||{};
    const promo=Number(b.promo||0), subscription=Number(b.subscription||0), purchased=Number(b.purchased||0);
    await client.query('update wallets set promo_credits=promo_credits+$2, subscription_credits=subscription_credits+$3, purchased_credits=purchased_credits+$4, updated_at=now() where user_id=$1',[row.user_id,promo,subscription,purchased]);
    for (const [bucket,amount] of Object.entries({promo,subscription,purchased})) if(Number(amount)>0) await client.query('insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing',[row.user_id,bucket,Number(amount),reason,'generation',job.id,`refund:${job.id}:${bucket}`]);
    await client.query("update generation_jobs set status='refunded', refunded_at=now() where id=$1",[job.id]);
    await client.query('commit'); return true;
  } catch(e) { await client.query('rollback'); throw e; } finally { client.release(); }
}

const blockedPromptPatterns=[/sexual\s+minor/i,/child\s+sexual/i,/csam/i,/non[- ]?consensual\s+sexual/i,/terrorist\s+propaganda/i];
const moderatePrompt=(prompt:string)=>({allowed:!blockedPromptPatterns.some(r=>r.test(prompt)),reason:blockedPromptPatterns.some(r=>r.test(prompt))?'blocked_high_risk_content':null});

const quoteSchema=z.object({type:z.enum(['image','video','product_ad','headshot','magic_edit']),seconds:z.number().int().min(0).max(60).optional().default(0),quality:z.enum(['fast','pro','cinematic']).optional().default('fast'),audio:z.boolean().optional().default(false),draft:z.boolean().optional().default(false)});
function quoteCost(input:z.infer<typeof quoteSchema>){
  if(input.type==='image'||input.type==='magic_edit') return input.quality==='fast'?5:10;
  if(input.type==='product_ad'||input.type==='headshot') return input.quality==='fast'?12:22;
  const per=input.quality==='fast'?5:input.quality==='pro'?8:12;
  const normal=Math.max(20,input.seconds*per+(input.audio?8:0));
  return input.draft?Math.max(8,Math.ceil(normal*.35)):normal;
}

app.get('/health',async(_req,res)=>{
  const db=await databaseHealth();
  res.json({ok:true,service:'veyra-ai-backend',version:'0.6.1-v2',uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),database:db,sessions:{configured:sessionsConfigured(),required:requireAuth},providers:{primary:process.env.AI_PROVIDER_PRIMARY||'mock',fallback:process.env.AI_PROVIDER_FALLBACK||'mock'},capabilities:['auth','credits','wallet','generation','projects','payments','moderation','reports','admin']});
});

app.post('/v1/auth/anonymous',async(req,res)=>{
  const p=z.object({deviceKey:z.string().min(8).max(300)}).safeParse(req.body);
  if(!p.success) return res.status(400).json({error:'invalid_request'});
  try{
    const user:any=await createAnonymousUser(p.data.deviceKey);
    const token=sessionsConfigured()?issueSession(user.id):null;
    res.status(201).json({userId:user.id,plan:user.plan??'free',credits:user.credits??await dbWalletCredits(user.id),token,authRequired:requireAuth});
  }catch(e){res.status(500).json({error:'auth_failed',detail:String(e)});}
});

app.get('/v1/store/products',(_req,res)=>res.json({items:creditProducts,subscriptions:[{id:'veyra_pro_monthly',title:'Veyra Pro',monthlyCredits:1200},{id:'veyra_business_monthly',title:'Veyra Business',monthlyCredits:3500}]}));

app.get('/v1/users/:userId/wallet',async(req,res)=>{
  if(!canAccess(req,req.params.userId)) return res.status(401).json({error:'unauthorized'});
  try{res.json(await getWallet(req.params.userId));}catch(e){res.status(404).json({error:String(e).includes('account_deleted')?'account_deleted':'not_found'});}
});

app.get('/v1/users/:userId/wallet/ledger',async(req,res)=>{
  const id=req.params.userId; if(!canAccess(req,id)) return res.status(401).json({error:'unauthorized'});
  if(!pool){memEnsureUser(id); return res.json({items:memLedger.filter(x=>x.userId===id).slice(-100).reverse()});}
  const r=await pool.query('select id,bucket,delta,reason,reference_type as "referenceType",reference_id as "referenceId",created_at as "createdAt" from credit_ledger where user_id=$1 order by created_at desc limit 100',[id]); res.json({items:r.rows});
});

app.get('/v1/users/:userId/generations',async(req,res)=>{
  const id=req.params.userId; if(!canAccess(req,id)) return res.status(401).json({error:'unauthorized'});
  if(!pool) return res.json({items:[...memJobs.values()].filter(j=>j.userId===id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))});
  const r=await pool.query('select id,kind as type,prompt,status,quality,aspect_ratio as "aspectRatio",duration_seconds as seconds,audio,provider,credits_reserved as cost,output_url as "outputUrl",failure_code as "failureCode",failure_message as "failureMessage",refunded_at as "refundedAt",created_at as "createdAt",completed_at as "completedAt" from generation_jobs where user_id=$1 order by created_at desc limit 100',[id]); res.json({items:r.rows});
});

app.post('/v1/quote',(req,res)=>{const p=quoteSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'invalid_request',details:p.error.flatten()});res.json({credits:quoteCost(p.data),currency:'VEYRA_CREDIT'});});

const generationSchema=z.object({userId:z.string().min(2),type:z.enum(['image','video','product_ad','headshot','magic_edit']),prompt:z.string().min(3).max(4000),seconds:z.number().int().min(0).max(60).optional().default(0),quality:z.enum(['fast','pro','cinematic']).optional().default('fast'),audio:z.boolean().optional().default(false),aspectRatio:z.enum(['9:16','16:9','1:1','4:5']).optional().default('9:16'),draft:z.boolean().optional().default(false),references:z.array(z.string().max(300)).max(8).optional().default([]),brandKit:z.boolean().optional().default(false),captions:z.boolean().optional().default(false)});

app.post('/v1/generations',async(req,res)=>{
  const p=generationSchema.safeParse(req.body); if(!p.success)return res.status(400).json({error:'invalid_request',details:p.error.flatten()});
  const b=p.data; if(!canAccess(req,b.userId))return res.status(401).json({error:'unauthorized'});
  const moderation=moderatePrompt(b.prompt); if(!moderation.allowed)return res.status(422).json({error:'content_blocked',reason:moderation.reason});
  const cost=quoteCost(b); const id=crypto.randomUUID();
  try{
    if(!pool){const u=memEnsureUser(b.userId);if(u.credits<cost)return res.status(402).json({error:'insufficient_credits',required:cost,available:u.credits});u.credits-=cost;memLedger.push({id:crypto.randomUUID(),userId:u.id,delta:-cost,reason:'generation_reserved',createdAt:new Date().toISOString(),ref:id});const job={id,userId:u.id,status:'queued',type:b.type,prompt:b.prompt,quality:b.quality,seconds:b.seconds,aspectRatio:b.aspectRatio,audio:b.audio,draft:b.draft,references:b.references,brandKit:b.brandKit,captions:b.captions,cost,provider:process.env.AI_PROVIDER_PRIMARY||'mock',createdAt:new Date().toISOString(),output:null};memJobs.set(id,job);return res.status(202).json(job);}
    const u=await dbEnsureUserById(b.userId); if(!u)return res.status(404).json({error:'user_not_found'});
    let breakdown:any; try{breakdown=await reserveDbCredits(b.userId,cost,id);}catch(e:any){if(e.message==='insufficient_credits')return res.status(402).json({error:'insufficient_credits',required:cost,available:e.available});throw e;}
    await pool.query('insert into generation_jobs(id,user_id,kind,prompt,prompt_moderation,status,quality,aspect_ratio,duration_seconds,audio,provider,credits_reserved,reservation_breakdown) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,b.userId,b.type,b.prompt,moderation,'queued',b.quality,b.aspectRatio,b.seconds,b.audio,process.env.AI_PROVIDER_PRIMARY||'mock',cost,breakdown]);
    return res.status(202).json({id,userId:b.userId,status:'queued',type:b.type,prompt:b.prompt,quality:b.quality,seconds:b.seconds,aspectRatio:b.aspectRatio,audio:b.audio,cost,provider:process.env.AI_PROVIDER_PRIMARY||'mock',createdAt:new Date().toISOString(),output:null});
  }catch(e){return res.status(500).json({error:'generation_create_failed',detail:String(e)});}
});

app.get('/v1/generations/:id',async(req,res)=>{
  if(!pool){const j=memJobs.get(req.params.id);if(!j)return res.status(404).json({error:'not_found'});if(!canAccess(req,j.userId))return res.status(401).json({error:'unauthorized'});return res.json(j);}
  const r=await pool.query('select id,user_id as "userId",kind as type,prompt,status,quality,aspect_ratio as "aspectRatio",duration_seconds as seconds,audio,provider,credits_reserved as cost,output_url as "outputUrl",failure_code as "failureCode",failure_message as "failureMessage",provider_job_id as "providerJobId",created_at as "createdAt",completed_at as "completedAt",refunded_at as "refundedAt" from generation_jobs where id=$1',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'not_found'});const j=r.rows[0];if(!canAccess(req,j.userId))return res.status(401).json({error:'unauthorized'});res.json(j);
});

app.post('/v1/generations/:id/report',async(req,res)=>{
  const p=z.object({userId:z.string().min(2),reason:z.enum(['unsafe','sexual','violence','hate','copyright','wrong_person','bad_quality','other']),details:z.string().max(1000).optional().default('')}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'invalid_request'});if(!canAccess(req,p.data.userId))return res.status(401).json({error:'unauthorized'});
  if(!pool){const j=memJobs.get(req.params.id);if(!j||j.userId!==p.data.userId)return res.status(404).json({error:'not_found'});const report={id:crypto.randomUUID(),generationId:j.id,...p.data,status:'open',createdAt:new Date().toISOString()};memReports.push(report);return res.status(201).json(report);}
  const reasonMap:any={violence:'violent',wrong_person:'identity',bad_quality:'bad_quality'};const reason=reasonMap[p.data.reason]||p.data.reason;
  const r=await pool.query('insert into generation_reports(generation_job_id,reporter_user_id,reason,details) select id,$2,$3,$4 from generation_jobs where id=$1 and user_id=$2 returning id,generation_job_id as "generationId",reason,details,status,created_at as "createdAt"',[req.params.id,p.data.userId,reason,p.data.details]);if(!r.rowCount)return res.status(404).json({error:'not_found'});res.status(201).json(r.rows[0]);
});

app.get('/v1/users/:userId/purchases',async(req,res)=>{const id=req.params.userId;if(!canAccess(req,id))return res.status(401).json({error:'unauthorized'});if(!pool)return res.json({items:[...memPurchases.values()].filter((p:any)=>p.userId===id)});const r=await pool.query('select id,platform,product_id as "productId",external_transaction_id as "transactionId",status,credits_granted as "creditsGranted",created_at as "createdAt",verified_at as "verifiedAt" from purchases where user_id=$1 order by created_at desc limit 100',[id]);res.json({items:r.rows});});

app.post('/v1/purchases/verify',async(req,res)=>{
  const p=z.object({userId:z.string().min(2),platform:z.enum(['google_play','apple']),productId:z.string().min(2),transactionId:z.string().min(2),purchaseToken:z.string().min(2)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'invalid_request'});const b=p.data;if(!canAccess(req,b.userId))return res.status(401).json({error:'unauthorized'});
  const product=creditProducts.find(x=>x.id===b.productId);if(!product)return res.status(400).json({error:'unknown_product'});
  const configured=b.platform==='google_play'?Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON):Boolean(process.env.APPLE_IAP_PRIVATE_KEY&&process.env.APPLE_IAP_KEY_ID&&process.env.APPLE_IAP_ISSUER_ID);
  if(!configured)return res.status(503).json({error:'store_verifier_not_configured'});
  return res.status(501).json({error:'store_verifier_adapter_pending'});
});

app.delete('/v1/users/:userId',async(req,res)=>{const id=req.params.userId;if(!canAccess(req,id))return res.status(401).json({error:'unauthorized'});if(!pool){const u=memEnsureUser(id);u.deletedAt=new Date().toISOString();u.credits=0;return res.status(202).json({ok:true,status:'deletion_requested',effectiveAt:u.deletedAt});}await pool.query("update users set status='deleted',deleted_at=now(),updated_at=now() where id=$1",[id]);await pool.query('insert into account_deletion_requests(user_id,status) values($1,$2)',[id,'requested']);res.status(202).json({ok:true,status:'deletion_requested'});});

app.post('/v1/generations/:id/mock-complete',adminGuard,async(req,res)=>{if(!pool){const j=memJobs.get(req.params.id);if(!j)return res.status(404).json({error:'not_found'});j.status='completed';j.output={kind:j.type,url:'https://example.invalid/veyra/mock-output'};j.completedAt=new Date().toISOString();return res.json(j);}const r=await pool.query("update generation_jobs set status='completed',output_url='https://example.invalid/veyra/mock-output',completed_at=now() where id=$1 returning id,user_id as \"userId\",kind as type,status,provider,credits_reserved as cost,output_url as \"outputUrl\"",[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'not_found'});res.json(r.rows[0]);});

app.post('/v1/generations/:id/mock-fail',adminGuard,async(req,res)=>{if(!pool){const j=memJobs.get(req.params.id);if(!j)return res.status(404).json({error:'not_found'});if(!j.refundedAt){memEnsureUser(j.userId).credits+=j.cost;memLedger.push({id:crypto.randomUUID(),userId:j.userId,delta:j.cost,reason:'generation_failed_auto_refund',createdAt:new Date().toISOString(),ref:j.id});j.refundedAt=new Date().toISOString();}j.status='refunded';return res.json(j);}const r=await pool.query('select * from generation_jobs where id=$1',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'not_found'});await refundDbJob(r.rows[0]);const out=await pool.query('select id,user_id as "userId",status,refunded_at as "refundedAt" from generation_jobs where id=$1',[req.params.id]);res.json(out.rows[0]);});

app.get('/v1/admin/summary',adminGuard,async(_req,res)=>{if(!pool){const total=[...memUsers.values()].reduce((s,u)=>s+u.credits,0);return res.json({users:memUsers.size,jobs:memJobs.size,reports:memReports.length,purchases:memPurchases.size,creditsOutstanding:total,database:'memory'});}const [u,j,r,p,w]=await Promise.all([pool.query('select count(*)::int as n from users'),pool.query('select count(*)::int as n from generation_jobs'),pool.query('select count(*)::int as n from generation_reports'),pool.query('select count(*)::int as n from purchases'),pool.query('select coalesce(sum(purchased_credits+subscription_credits+promo_credits),0)::bigint as n from wallets')]);res.json({users:u.rows[0].n,jobs:j.rows[0].n,reports:r.rows[0].n,purchases:p.rows[0].n,creditsOutstanding:Number(w.rows[0].n),database:'postgres'});});

app.use((_req,res)=>res.status(404).json({error:'route_not_found'}));
const port=Number(process.env.PORT||8080);
app.listen(port,'0.0.0.0',()=>console.log(`Veyra Cloud v2 listening on :${port} (${databaseConfigured?'postgres':'memory'})`));
