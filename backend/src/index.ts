import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import crypto from 'node:crypto';
import { photoLabRouter } from './photo_lab_routes.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '4mb' }));
app.use('/v1/photo-lab', photoLabRouter);

const startedAt = Date.now();
const users = new Map<string, { id: string; email?: string; plan: 'free'|'pro'|'business'; credits: number; deletedAt?: string }>();
const ledger: Array<{ id: string; userId: string; delta: number; reason: string; createdAt: string; ref?: string }> = [];
const jobs = new Map<string, any>();
const brandKits = new Map<string, any>();
const reports: any[] = [];
const purchases = new Map<string, any>();
const integrityEvents: any[] = [];

const creditProducts = [
  { id: 'veyra_credits_250', credits: 250, title: 'Starter', badge: null },
  { id: 'veyra_credits_700', credits: 700, title: 'Creator', badge: 'Popular' },
  { id: 'veyra_credits_1600', credits: 1600, title: 'Pro Pack', badge: 'Best value' },
  { id: 'veyra_credits_4000', credits: 4000, title: 'Studio', badge: null },
];
const ensureUser=(id:string)=>{if(!users.has(id))users.set(id,{id,plan:'free',credits:100});const user=users.get(id)!;if(user.deletedAt)throw new Error('account_deleted');return user};
const bearer=(req:express.Request)=>req.header('authorization')?.replace(/^Bearer\s+/i,'')??'';
const safeEqual=(a:string,b:string)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)};
const adminGuard:express.RequestHandler=(req,res,next)=>{const expected=process.env.VEYRA_ADMIN_TOKEN??'',supplied=req.header('x-admin-token')??bearer(req);if(!expected||!safeEqual(expected,supplied))return res.status(401).json({error:'unauthorized'});next()};
function credit(userId:string,delta:number,reason:string,ref?:string){const user=ensureUser(userId);user.credits+=delta;ledger.push({id:crypto.randomUUID(),userId,delta,reason,createdAt:new Date().toISOString(),ref});return user.credits}
function refundJob(job:any,reason='generation_refund'){if(job.refundedAt)return false;credit(job.userId,job.cost,reason,job.id);job.refundedAt=new Date().toISOString();job.status='refunded';return true}
const blockedPromptPatterns=[/sexual\s+minor/i,/child\s+sexual/i,/csam/i,/non[- ]?consensual\s+sexual/i,/terrorist\s+propaganda/i];
function moderatePrompt(prompt:string){const blocked=blockedPromptPatterns.some(r=>r.test(prompt));return{allowed:!blocked,reason:blocked?'blocked_high_risk_content':null}}
app.get('/health',(_req,res)=>res.json({ok:true,service:'veyra-ai-backend',version:'0.6.0',uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),providers:{primary:process.env.AI_PROVIDER_PRIMARY||'mock',fallback:process.env.AI_PROVIDER_FALLBACK||'mock'},capabilities:['create','studio','photo-lab','copilot','business','projects','credits','wallet','admin','moderation','reports','payments','integrity']}));
app.get('/v1/store/products',(_req,res)=>res.json({items:creditProducts,subscriptions:[{id:'veyra_pro_monthly',title:'Veyra Pro',monthlyCredits:1200},{id:'veyra_business_monthly',title:'Veyra Business',monthlyCredits:3500}]}));
app.get('/v1/users/:userId/wallet',(req,res)=>{const u=ensureUser(req.params.userId);res.json({userId:u.id,plan:u.plan,credits:u.credits})});
app.get('/v1/users/:userId/wallet/ledger',(req,res)=>{ensureUser(req.params.userId);res.json({items:ledger.filter(x=>x.userId===req.params.userId).slice(-100).reverse()})});
app.get('/v1/users/:userId/purchases',(req,res)=>{ensureUser(req.params.userId);res.json({items:[...purchases.values()].filter((p:any)=>p.userId===req.params.userId)})});
app.get('/v1/users/:userId/generations',(req,res)=>res.json({items:[...jobs.values()].filter(j=>j.userId===req.params.userId)}));
const quoteSchema=z.object({type:z.enum(['image','video','product_ad','headshot','magic_edit']),seconds:z.number().int().min(0).max(60).optional().default(0),quality:z.enum(['fast','pro','cinematic']).optional().default('fast'),audio:z.boolean().optional().default(false),draft:z.boolean().optional().default(false)});
function quoteCost(i:z.infer<typeof quoteSchema>){if(i.type==='image'||i.type==='magic_edit')return i.quality==='fast'?5:10;if(i.type==='product_ad'||i.type==='headshot')return i.quality==='fast'?12:22;const p=i.quality==='fast'?5:i.quality==='pro'?8:12,n=Math.max(20,i.seconds*p+(i.audio?8:0));return i.draft?Math.max(8,Math.ceil(n*.35)):n}
app.post('/v1/quote',(req,res)=>{const p=quoteSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'invalid_request'});res.json({credits:quoteCost(p.data),currency:'VEYRA_CREDIT'})});
const generationSchema=z.object({userId:z.string().min(2),type:z.enum(['image','video','product_ad','headshot','magic_edit']),prompt:z.string().min(3).max(4000),seconds:z.number().int().min(0).max(60).optional().default(0),quality:z.enum(['fast','pro','cinematic']).optional().default('fast'),audio:z.boolean().optional().default(false),aspectRatio:z.enum(['9:16','16:9','1:1','4:5']).optional().default('9:16'),draft:z.boolean().optional().default(false),references:z.array(z.string().max(300)).max(8).optional().default([]),brandKit:z.boolean().optional().default(false),captions:z.boolean().optional().default(false)});
app.post('/v1/generations',(req,res)=>{const p=generationSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'invalid_request'});const b=p.data,m=moderatePrompt(b.prompt);if(!m.allowed)return res.status(422).json({error:'content_blocked',reason:m.reason});const u=ensureUser(b.userId),cost=quoteCost(b);if(u.credits<cost)return res.status(402).json({error:'insufficient_credits'});u.credits-=cost;const id=crypto.randomUUID(),job={id,userId:u.id,status:'queued',...b,cost,createdAt:new Date().toISOString(),output:null};jobs.set(id,job);res.status(202).json(job)});
app.get('/v1/generations/:id',(req,res)=>{const j=jobs.get(req.params.id);j?res.json(j):res.status(404).json({error:'not_found'})});
app.delete('/v1/users/:userId',(req,res)=>{const u=ensureUser(req.params.userId);u.deletedAt=new Date().toISOString();u.credits=0;res.status(202).json({ok:true,status:'deletion_requested'})});
app.post('/v1/generations/:id/mock-complete',adminGuard,(req,res)=>{const j=jobs.get(req.params.id);if(!j)return res.status(404).json({error:'not_found'});j.status='completed';j.output={kind:j.type,url:'https://example.invalid/veyra/mock-output'};res.json(j)});
app.post('/v1/generations/:id/mock-fail',adminGuard,(req,res)=>{const j=jobs.get(req.params.id);if(!j)return res.status(404).json({error:'not_found'});refundJob(j);res.json(j)});
const port=Number(process.env.PORT||3000);app.listen(port,()=>console.log(`veyra-ai-backend listening on :${port}`));
