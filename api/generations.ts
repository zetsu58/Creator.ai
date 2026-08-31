import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureGenerationSchema, pool } from '../backend/src/db.js';
import { generationInputImage, isVeyraBlobImageUrl } from '../backend/src/blob_asset.js';
import { requireUser } from '../backend/src/api_auth.js';

type Kind = 'image'|'video'|'product_ad'|'headshot'|'magic_edit'; type Quality='fast'|'pro'|'cinematic';
type Body={userId?:string;type?:Kind;prompt?:string;seconds?:number;quality?:Quality;audio?:boolean;aspectRatio?:'9:16'|'16:9'|'1:1'|'4:5';draft?:boolean;references?:string[]};
function quoteCost(b:Required<Pick<Body,'type'|'quality'|'audio'|'draft'>>&{seconds:number}){if(b.type==='image'||b.type==='magic_edit')return b.quality==='fast'?5:10;if(b.type==='product_ad'||b.type==='headshot')return b.quality==='fast'?12:22;const per=b.quality==='fast'?5:b.quality==='pro'?8:12;const normal=Math.max(20,b.seconds*per+(b.audio?8:0));return b.draft?Math.max(8,Math.ceil(normal*.35)):normal;}
const blocked=[/sexual\s+minor/i,/child\s+sexual/i,/csam/i,/non[- ]?consensual\s+sexual/i,/terrorist\s+propaganda/i];

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  if(!pool)return res.status(503).json({error:'database_not_configured'});
  await ensureGenerationSchema();
  const b=(req.body??{})as Body,userId=String(b.userId??'').trim(),type=b.type,prompt=String(b.prompt??'').trim(),quality:Quality=b.quality??'fast',seconds=Number.isInteger(b.seconds)?Number(b.seconds):0,audio=Boolean(b.audio),aspectRatio=b.aspectRatio??'9:16',draft=Boolean(b.draft),references=Array.isArray(b.references)?b.references.filter(x=>typeof x==='string').slice(0,8):[];
  if(!userId||!type||!['image','video','product_ad','headshot','magic_edit'].includes(type)||prompt.length<3||prompt.length>4000||seconds<0||seconds>60)return res.status(400).json({error:'invalid_request'});
  if(!['fast','pro','cinematic'].includes(quality)||!['9:16','16:9','1:1','4:5'].includes(aspectRatio))return res.status(400).json({error:'invalid_request'});
  if(!await requireUser(req,userId))return res.status(401).json({error:'unauthorized'});
  if(blocked.some(r=>r.test(prompt)))return res.status(422).json({error:'content_blocked',reason:'blocked_high_risk_content'});
  if(references.length>0&&type==='video'&&!isVeyraBlobImageUrl(references[0]))return res.status(400).json({error:'invalid_image_reference',message:'Image-to-Video yalnızca Veyra üzerinden yüklenmiş görsel kabul eder.'});

  const imageUrl=generationInputImage(type,references),cost=quoteCost({type,quality,audio,draft,seconds}),id=crypto.randomUUID();
  const client=await pool.connect();let breakdown={promo:0,subscription:0,purchased:0};
  try{
    await client.query('begin');
    const user=await client.query("select id from users where id=$1 and status='active' for update",[userId]);
    if(!user.rowCount){await client.query('rollback');return res.status(404).json({error:'user_not_found'});}
    const wr=await client.query('select purchased_credits,subscription_credits,promo_credits from wallets where user_id=$1 for update',[userId]);
    if(!wr.rowCount){await client.query('rollback');return res.status(409).json({error:'wallet_not_found'});}
    const w=wr.rows[0],available=Number(w.purchased_credits)+Number(w.subscription_credits)+Number(w.promo_credits);
    if(available<cost){await client.query('rollback');return res.status(402).json({error:'insufficient_credits',required:cost,available});}
    let left=cost;breakdown.promo=Math.min(left,Number(w.promo_credits));left-=breakdown.promo;breakdown.subscription=Math.min(left,Number(w.subscription_credits));left-=breakdown.subscription;breakdown.purchased=Math.min(left,Number(w.purchased_credits));
    await client.query('update wallets set promo_credits=promo_credits-$2,subscription_credits=subscription_credits-$3,purchased_credits=purchased_credits-$4,updated_at=now() where user_id=$1',[userId,breakdown.promo,breakdown.subscription,breakdown.purchased]);
    for(const[bucket,amount]of Object.entries(breakdown))if(amount>0)await client.query('insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,$2,$3,$4,$5,$6,$7)',[userId,bucket,-amount,'generation_reserved','generation',id,`reserve:${id}:${bucket}`]);
    await client.query('insert into generation_jobs(id,user_id,kind,prompt,prompt_moderation,status,quality,aspect_ratio,duration_seconds,audio,input_image_url,provider,credits_reserved,reservation_breakdown) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id,userId,type,prompt,{allowed:true},'queued',quality,aspectRatio,seconds,audio,imageUrl,process.env.AI_PROVIDER_PRIMARY||'auto',cost,breakdown]);
    await client.query('commit');
  }catch(e){
    await client.query('rollback');console.error('[api/generations] reserve failed',String(e).slice(0,700));return res.status(500).json({error:'generation_create_failed'});
  }finally{client.release();}

  // IMPORTANT: provider generation is intentionally NOT started in this HTTP request.
  // Long-running video providers can exceed Vercel's request lifetime. A durable worker owns
  // queued -> processing -> completed/refunded transitions. The client receives the job now
  // and follows it through /api/generation-status.
  return res.status(202).json({
    id,userId,type,status:'queued',quality,aspectRatio,seconds,audio,inputImageUrl:imageUrl,
    provider:process.env.AI_PROVIDER_PRIMARY||'auto',providerJobId:null,cost,outputUrl:null,createdAt:new Date().toISOString()
  });
}
