import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureGenerationSchema, pool } from '../backend/src/db.js';
import { pollProvider } from '../backend/src/provider.js';
import { requireUser } from '../backend/src/api_auth.js';

async function refund(jobId:string,reason:string,message:string){
  if(!pool)return; const client=await pool.connect();
  try{
    await client.query('begin');
    const r=await client.query('select id,user_id,reservation_breakdown,refunded_at,status from generation_jobs where id=$1 for update',[jobId]);
    if(!r.rowCount||r.rows[0].refunded_at){await client.query('rollback');return;}
    const row=r.rows[0], b=row.reservation_breakdown??{};
    const promo=Number(b.promo??0),subscription=Number(b.subscription??0),purchased=Number(b.purchased??0);
    await client.query('update wallets set promo_credits=promo_credits+$2,subscription_credits=subscription_credits+$3,purchased_credits=purchased_credits+$4,updated_at=now() where user_id=$1',[row.user_id,promo,subscription,purchased]);
    for(const [bucket,amount] of Object.entries({promo,subscription,purchased})) if(Number(amount)>0) await client.query('insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing',[row.user_id,bucket,Number(amount),'generation_failed_auto_refund','generation',jobId,`status-refund:${jobId}:${bucket}`]);
    await client.query("update generation_jobs set status='refunded',failure_code=$2,failure_message=$3,refunded_at=now(),completed_at=now() where id=$1",[jobId,reason,message.slice(0,900)]);
    await client.query('commit');
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  if(!pool)return res.status(503).json({error:'database_not_configured'});
  await ensureGenerationSchema();
  const id=String(req.query.id??'').trim();
  if(!id)return res.status(400).json({error:'missing_job_id'});
  const found=await pool.query('select id,user_id as "userId",kind as type,prompt,status,quality,aspect_ratio as "aspectRatio",duration_seconds as seconds,audio,input_image_url as "inputImageUrl",provider,provider_job_id as "providerJobId",credits_reserved as cost,output_url as "outputUrl",failure_code as "failureCode",failure_message as "failureMessage",refunded_at as "refundedAt",created_at as "createdAt",completed_at as "completedAt" from generation_jobs where id=$1',[id]);
  if(!found.rowCount)return res.status(404).json({error:'not_found'});
  let job=found.rows[0];
  if(!await requireUser(req,job.userId))return res.status(401).json({error:'unauthorized'});
  if(job.status==='processing'&&job.providerJobId){
    try{
      const state=await pollProvider(String(job.providerJobId));
      if(state.status==='completed'){
        if(!state.outputUrl)throw new Error('provider_completed_without_output');
        await pool.query("update generation_jobs set status='completed',output_url=$2,completed_at=now() where id=$1 and status='processing'",[id,state.outputUrl]);
      }else if(state.status==='failed') await refund(id,'provider_failed',state.error||'provider_failed');
    }catch(e){
      const age=await pool.query('select extract(epoch from (now()-started_at))::int as age from generation_jobs where id=$1',[id]);
      if(Number(age.rows[0]?.age??0)>1200)await refund(id,'provider_timeout',String(e)); else console.warn('[api/generation-status] provider poll error',String(e).slice(0,500));
    }
    const refreshed=await pool.query('select id,user_id as "userId",kind as type,prompt,status,quality,aspect_ratio as "aspectRatio",duration_seconds as seconds,audio,input_image_url as "inputImageUrl",provider,provider_job_id as "providerJobId",credits_reserved as cost,output_url as "outputUrl",failure_code as "failureCode",failure_message as "failureMessage",refunded_at as "refundedAt",created_at as "createdAt",completed_at as "completedAt" from generation_jobs where id=$1',[id]);
    job=refreshed.rows[0];
  }
  return res.status(200).json(job);
}
