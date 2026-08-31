import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, databaseConfigured, databaseHealth } from './db.js';
import { issueSession, sessionsConfigured, verifySession } from './session.js';
import { startGenerationWorker } from './generation_worker.js';

// NOTE: existing application routes/content remain generated from this service build.
// The durable worker is started after the HTTP server binds so queued jobs created by
// Vercel/API are consumed independently of the originating request lifetime.

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
const safeEqual = (a:string,b:string) => { const aa=Buffer.from(a); const bb=Buffer.from(b); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); };
function canAccess(req: express.Request, userId:string) { if (!requireAuth) return true; const session=verifySession(bearer(req)); return session?.userId===userId; }
const adminGuard: express.RequestHandler=(req,res,next)=>{const expected=process.env.VEYRA_ADMIN_TOKEN??'';const supplied=req.header('x-admin-token')??bearer(req);if(!expected||!safeEqual(expected,supplied))return res.status(401).json({error:'unauthorized'});next();};
function memEnsureUser(id:string){if(!memUsers.has(id))memUsers.set(id,{id,plan:'free',credits:100});const user=memUsers.get(id)!;if(user.deletedAt)throw new Error('account_deleted');return user;}
async function dbEnsureUserById(id:string){if(!pool)return null;const found=await pool.query('select id, plan, status, deleted_at from users where id=$1',[id]);if(!found.rowCount)return null;if(found.rows[0].status==='deleted')throw new Error('account_deleted');return found.rows[0];}
async function dbWalletCredits(userId:string){if(!pool)return 0;const r=await pool.query('select purchased_credits,subscription_credits,promo_credits from wallets where user_id=$1',[userId]);if(!r.rowCount)return 0;const w=r.rows[0];return Number(w.purchased_credits)+Number(w.subscription_credits)+Number(w.promo_credits);}
async function createAnonymousUser(deviceKey:string){const external=`anon:${crypto.createHash('sha256').update(deviceKey).digest('hex')}`;if(!pool){const existing=[...memUsers.values()].find(u=>u.externalAuthId===external);if(existing)return existing;const id=crypto.randomUUID();const user:any={id,externalAuthId:external,plan:'free',credits:100};memUsers.set(id,user);return user;}const client=await pool.connect();try{await client.query('begin');let r=await client.query('select id, plan, status from users where external_auth_id=$1 for update',[external]);if(!r.rowCount){r=await client.query("insert into users(external_auth_id,plan,status) values($1,'free','active') returning id,plan,status",[external]);const id=r.rows[0].id;await client.query('insert into wallets(user_id,promo_credits) values($1,100)',[id]);await client.query("insert into credit_ledger(user_id,bucket,delta,reason,idempotency_key) values($1,'promo',100,'welcome_bonus',$2) on conflict do nothing",[id,`welcome:${id}`]);}await client.query('commit');return{id:r.rows[0].id,plan:r.rows[0].plan,credits:await dbWalletCredits(r.rows[0].id)};}catch(e){await client.query('rollback');throw e;}finally{client.release();}}
async function getWallet(userId:string){if(!pool){const u=memEnsureUser(userId);return{userId:u.id,plan:u.plan,credits:u.credits};}const u=await dbEnsureUserById(userId);if(!u)throw new Error('not_found');return{userId:u.id,plan:u.plan,credits:await dbWalletCredits(userId)};}
const blockedPromptPatterns=[/sexual\s+minor/i,/child\s+sexual/i,/csam/i,/non[- ]?consensual\s+sexual/i,/terrorist\s+propaganda/i];
const moderatePrompt=(prompt:string)=>({allowed:!blockedPromptPatterns.some(r=>r.test(prompt)),reason:blockedPromptPatterns.some(r=>r.test(prompt))?'blocked_high_risk_content':null});
const quoteSchema=z.object({type:z.enum(['image','video','product_ad','headshot','magic_edit']),seconds:z.number().int().min(0).max(60).optional().default(0),quality:z.enum(['fast','pro','cinematic']).optional().default('fast'),audio:z.boolean().optional().default(false),draft:z.boolean().optional().default(false)});
function quoteCost(input:z.infer<typeof quoteSchema>){if(input.type==='image'||input.type==='magic_edit')return input.quality==='fast'?5:10;if(input.type==='product_ad'||input.type==='headshot')return input.quality==='fast'?12:22;const per=input.quality==='fast'?5:input.quality==='pro'?8:12;const normal=Math.max(20,input.seconds*per+(input.audio?8:0));return input.draft?Math.max(8,Math.ceil(normal*.35)):normal;}

app.get('/health',async(_req,res)=>{const db=await databaseHealth();res.json({ok:true,service:'veyra-ai-backend',version:'0.6.2-v2',uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),database:db,sessions:{configured:sessionsConfigured(),required:requireAuth},worker:{enabled:Boolean(pool)},providers:{primary:process.env.AI_PROVIDER_PRIMARY||'auto',fallback:process.env.AI_PROVIDER_FALLBACK||null},capabilities:['auth','credits','wallet','generation','projects','payments','moderation','reports','admin','generation-worker']});});
app.post('/v1/auth/anonymous',async(req,res)=>{const p=z.object({deviceKey:z.string().min(8).max(300)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'invalid_request'});try{const user:any=await createAnonymousUser(p.data.deviceKey);const token=sessionsConfigured()?issueSession(user.id):null;res.status(201).json({userId:user.id,plan:user.plan??'free',credits:user.credits??await dbWalletCredits(user.id),token,authRequired:requireAuth});}catch(e){res.status(500).json({error:'auth_failed'});}});
app.get('/v1/store/products',(_req,res)=>res.json({items:creditProducts,subscriptions:[{id:'veyra_pro_monthly',title:'Veyra Pro',monthlyCredits:1200},{id:'veyra_business_monthly',title:'Veyra Business',monthlyCredits:3500}]}));
app.get('/v1/users/:userId/wallet',async(req,res)=>{if(!canAccess(req,req.params.userId))return res.status(401).json({error:'unauthorized'});try{res.json(await getWallet(req.params.userId));}catch(e){res.status(404).json({error:'not_found'});}});
app.get('/v1/users/:userId/generations',async(req,res)=>{const id=req.params.userId;if(!canAccess(req,id))return res.status(401).json({error:'unauthorized'});if(!pool)return res.json({items:[...memJobs.values()].filter(j=>j.userId===id)});const r=await pool.query('select id,kind as type,prompt,status,quality,aspect_ratio as "aspectRatio",duration_seconds as seconds,audio,provider,credits_reserved as cost,output_url as "outputUrl",failure_code as "failureCode",failure_message as "failureMessage",refunded_at as "refundedAt",created_at as "createdAt",completed_at as "completedAt" from generation_jobs where user_id=$1 order by created_at desc limit 100',[id]);res.json({items:r.rows});});
app.get('/v1/generations/:id',async(req,res)=>{if(!pool){const j=memJobs.get(req.params.id);if(!j)return res.status(404).json({error:'not_found'});return res.json(j);}const r=await pool.query('select id,user_id as "userId",kind as type,prompt,status,quality,aspect_ratio as "aspectRatio",duration_seconds as seconds,audio,provider,credits_reserved as cost,output_url as "outputUrl",failure_code as "failureCode",failure_message as "failureMessage",provider_job_id as "providerJobId",created_at as "createdAt",completed_at as "completedAt",refunded_at as "refundedAt" from generation_jobs where id=$1',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'not_found'});const j=r.rows[0];if(!canAccess(req,j.userId))return res.status(401).json({error:'unauthorized'});res.json(j);});
app.get('/v1/admin/summary',adminGuard,async(_req,res)=>{if(!pool)return res.json({users:memUsers.size,jobs:memJobs.size,database:'memory'});const[u,j]=await Promise.all([pool.query('select count(*)::int as n from users'),pool.query('select count(*)::int as n from generation_jobs')]);res.json({users:u.rows[0].n,jobs:j.rows[0].n,database:'postgres'});});
app.use((_req,res)=>res.status(404).json({error:'route_not_found'}));
const port=Number(process.env.PORT||8080);
app.listen(port,'0.0.0.0',()=>{
  console.log(`Veyra Cloud v2 listening on :${port} (${databaseConfigured?'postgres':'memory'})`);
  startGenerationWorker();
});
