import { pool } from './db.js';
import { pollProvider, providerConfigured, startProvider } from './provider.js';

let running=false;
let timer:NodeJS.Timeout|null=null;

function logWorker(event:string, details:Record<string,unknown>={}) {
  try {
    console.log(`[generation-worker] ${event} ${JSON.stringify(details)}`);
  } catch {
    console.log(`[generation-worker] ${event}`);
  }
}

async function refund(job:any, reason:string, message:string) {
  if(!pool) return;
  logWorker('refund', {jobId:job?.id, reason, message:String(message).slice(0,700)});
  const client=await pool.connect();
  try{
    await client.query('begin');
    const lock=await client.query('select id,user_id,reservation_breakdown,refunded_at,status from generation_jobs where id=$1 for update',[job.id]);
    if(!lock.rowCount){await client.query('rollback');return;}
    const row=lock.rows[0];
    if(row.refunded_at){await client.query('rollback');return;}
    const b=row.reservation_breakdown||{};
    const promo=Number(b.promo||0), subscription=Number(b.subscription||0), purchased=Number(b.purchased||0);
    await client.query('update wallets set promo_credits=promo_credits+$2,subscription_credits=subscription_credits+$3,purchased_credits=purchased_credits+$4,updated_at=now() where user_id=$1',[row.user_id,promo,subscription,purchased]);
    for(const [bucket,amount] of Object.entries({promo,subscription,purchased})){
      if(Number(amount)>0) await client.query('insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing',[row.user_id,bucket,Number(amount),'generation_failed_auto_refund','generation',row.id,`worker-refund:${row.id}:${bucket}`]);
    }
    await client.query("update generation_jobs set status='refunded',failure_code=$2,failure_message=$3,refunded_at=now(),completed_at=now() where id=$1",[row.id,reason,message.slice(0,900)]);
    await client.query('commit');
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
}

async function processQueued(){
  if(!pool) return;
  const r=await pool.query("select id,kind as type,prompt,quality,aspect_ratio as \"aspectRatio\",duration_seconds as seconds,audio from generation_jobs where status='queued' order by created_at asc limit 3");
  for(const job of r.rows){
    if(!providerConfigured()){
      await refund(job,'provider_not_configured','AI provider is not configured on the server.');
      continue;
    }
    const claimed=await pool.query("update generation_jobs set status='processing',started_at=coalesce(started_at,now()) where id=$1 and status='queued' returning id",[job.id]);
    if(!claimed.rowCount) continue;
    try{
      logWorker('submit', {jobId:job.id,type:job.type,aspectRatio:job.aspectRatio,seconds:job.seconds,audio:job.audio});
      const started=await startProvider(job);
      logWorker('submitted', {jobId:job.id,providerJobId:started.providerJobId,status:started.status});
      if(started.status==='completed'){
        if(!started.outputUrl) throw new Error('provider_completed_without_output');
        await pool.query("update generation_jobs set provider_job_id=$2,status='completed',output_url=$3,completed_at=now() where id=$1",[job.id,started.providerJobId,started.outputUrl]);
        logWorker('completed', {jobId:job.id,providerJobId:started.providerJobId});
      }else{
        await pool.query('update generation_jobs set provider_job_id=$2 where id=$1',[job.id,started.providerJobId]);
      }
    }catch(e){
      const message=String(e);
      logWorker('submit_failed', {jobId:job.id,error:message.slice(0,700)});
      await refund(job,'provider_submit_failed',message);
    }
  }
}

async function processActive(){
  if(!pool) return;
  const r=await pool.query("select id,provider_job_id from generation_jobs where status='processing' and provider_job_id is not null order by started_at asc limit 8");
  for(const job of r.rows){
    try{
      const state=await pollProvider(String(job.provider_job_id));
      if(state.status==='completed'){
        if(!state.outputUrl) throw new Error('provider_completed_without_output');
        await pool.query("update generation_jobs set status='completed',output_url=$2,completed_at=now() where id=$1 and status='processing'",[job.id,state.outputUrl]);
        logWorker('completed', {jobId:job.id,providerJobId:job.provider_job_id});
      }else if(state.status==='failed'){
        logWorker('provider_failed', {jobId:job.id,providerJobId:job.provider_job_id,error:state.error});
        await refund(job,'provider_failed',state.error||'provider_failed');
      }
    }catch(e){
      const message=String(e);
      logWorker('poll_error', {jobId:job.id,providerJobId:job.provider_job_id,error:message.slice(0,700)});
      const age=await pool.query('select extract(epoch from (now()-started_at))::int as age from generation_jobs where id=$1',[job.id]);
      if(Number(age.rows[0]?.age||0)>1200) await refund(job,'provider_timeout',message);
    }
  }
}

export async function runGenerationWorkerOnce(){
  if(running||!pool) return;
  running=true;
  try{await processQueued();await processActive();}finally{running=false;}
}

export function startGenerationWorker(){
  if(timer||!pool) return;
  logWorker('started');
  void runGenerationWorkerOnce();
  timer=setInterval(()=>void runGenerationWorkerOnce(),5000);
  timer.unref();
}
