import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool } from '../backend/src/db.js';
import { generationInputImage, isVeyraBlobImageUrl } from '../backend/src/blob_asset.js';
import { sessionsConfigured, verifySession } from '../backend/src/session.js';
import { startProvider } from '../backend/src/provider.js';

type Kind = 'image'|'video'|'product_ad'|'headshot'|'magic_edit';
type Quality = 'fast'|'pro'|'cinematic';

type Body = {
  userId?: string;
  type?: Kind;
  prompt?: string;
  seconds?: number;
  quality?: Quality;
  audio?: boolean;
  aspectRatio?: '9:16'|'16:9'|'1:1'|'4:5';
  draft?: boolean;
  references?: string[];
};

function bearer(req: VercelRequest) {
  const h = String(req.headers.authorization ?? '');
  return h.replace(/^Bearer\s+/i, '');
}

function authorized(req: VercelRequest, userId: string) {
  if (sessionsConfigured()) return verifySession(bearer(req))?.userId === userId;
  return String(process.env.VEYRA_REQUIRE_AUTH ?? 'false').toLowerCase() !== 'true';
}

function quoteCost(b: Required<Pick<Body,'type'|'quality'|'audio'|'draft'>> & {seconds:number}) {
  if (b.type === 'image' || b.type === 'magic_edit') return b.quality === 'fast' ? 5 : 10;
  if (b.type === 'product_ad' || b.type === 'headshot') return b.quality === 'fast' ? 12 : 22;
  const per = b.quality === 'fast' ? 5 : b.quality === 'pro' ? 8 : 12;
  const normal = Math.max(20, b.seconds * per + (b.audio ? 8 : 0));
  return b.draft ? Math.max(8, Math.ceil(normal * 0.35)) : normal;
}

const blocked = [/sexual\s+minor/i,/child\s+sexual/i,/csam/i,/non[- ]?consensual\s+sexual/i,/terrorist\s+propaganda/i];

async function refund(jobId: string, reason: string, message: string) {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const r = await client.query('select id,user_id,reservation_breakdown,refunded_at from generation_jobs where id=$1 for update',[jobId]);
    if (!r.rowCount || r.rows[0].refunded_at) { await client.query('rollback'); return; }
    const row = r.rows[0];
    const b = row.reservation_breakdown ?? {};
    const promo = Number(b.promo ?? 0), subscription = Number(b.subscription ?? 0), purchased = Number(b.purchased ?? 0);
    await client.query('update wallets set promo_credits=promo_credits+$2,subscription_credits=subscription_credits+$3,purchased_credits=purchased_credits+$4,updated_at=now() where user_id=$1',[row.user_id,promo,subscription,purchased]);
    for (const [bucket, amount] of Object.entries({promo,subscription,purchased})) {
      if (Number(amount) > 0) await client.query('insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing',[row.user_id,bucket,Number(amount),'generation_failed_auto_refund','generation',jobId,`vercel-refund:${jobId}:${bucket}`]);
    }
    await client.query("update generation_jobs set status='refunded',failure_code=$2,failure_message=$3,refunded_at=now(),completed_at=now() where id=$1",[jobId,reason,message.slice(0,900)]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally { client.release(); }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});
  if (!pool) return res.status(503).json({error:'database_not_configured'});

  const b = (req.body ?? {}) as Body;
  const userId = String(b.userId ?? '').trim();
  const type = b.type;
  const prompt = String(b.prompt ?? '').trim();
  const quality: Quality = b.quality ?? 'fast';
  const seconds = Number.isInteger(b.seconds) ? Number(b.seconds) : 0;
  const audio = Boolean(b.audio);
  const aspectRatio = b.aspectRatio ?? '9:16';
  const draft = Boolean(b.draft);
  const references = Array.isArray(b.references) ? b.references.filter(x => typeof x === 'string').slice(0,8) : [];

  if (!userId || !type || !['image','video','product_ad','headshot','magic_edit'].includes(type)) return res.status(400).json({error:'invalid_request'});
  if (prompt.length < 3 || prompt.length > 4000 || seconds < 0 || seconds > 60) return res.status(400).json({error:'invalid_request'});
  if (!['fast','pro','cinematic'].includes(quality) || !['9:16','16:9','1:1','4:5'].includes(aspectRatio)) return res.status(400).json({error:'invalid_request'});
  if (!authorized(req,userId)) return res.status(401).json({error:'unauthorized'});
  if (blocked.some(r => r.test(prompt))) return res.status(422).json({error:'content_blocked',reason:'blocked_high_risk_content'});

  if (references.length > 0 && type === 'video' && !isVeyraBlobImageUrl(references[0])) {
    return res.status(400).json({error:'invalid_image_reference',message:'Image-to-Video yalnızca Veyra üzerinden yüklenmiş görsel kabul eder.'});
  }
  const imageUrl = generationInputImage(type,references);
  const cost = quoteCost({type,quality,audio,draft,seconds});
  const id = crypto.randomUUID();
  const client = await pool.connect();
  let breakdown = {promo:0,subscription:0,purchased:0};
  try {
    await client.query('begin');
    const user = await client.query("select id from users where id=$1 and status='active' for update",[userId]);
    if (!user.rowCount) { await client.query('rollback'); return res.status(404).json({error:'user_not_found'}); }
    const wr = await client.query('select purchased_credits,subscription_credits,promo_credits from wallets where user_id=$1 for update',[userId]);
    if (!wr.rowCount) { await client.query('rollback'); return res.status(409).json({error:'wallet_not_found'}); }
    const w = wr.rows[0];
    const available = Number(w.purchased_credits)+Number(w.subscription_credits)+Number(w.promo_credits);
    if (available < cost) { await client.query('rollback'); return res.status(402).json({error:'insufficient_credits',required:cost,available}); }
    let left = cost;
    breakdown.promo = Math.min(left,Number(w.promo_credits)); left -= breakdown.promo;
    breakdown.subscription = Math.min(left,Number(w.subscription_credits)); left -= breakdown.subscription;
    breakdown.purchased = Math.min(left,Number(w.purchased_credits));
    await client.query('update wallets set promo_credits=promo_credits-$2,subscription_credits=subscription_credits-$3,purchased_credits=purchased_credits-$4,updated_at=now() where user_id=$1',[userId,breakdown.promo,breakdown.subscription,breakdown.purchased]);
    for (const [bucket, amount] of Object.entries(breakdown)) {
      if (amount > 0) await client.query('insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,$2,$3,$4,$5,$6,$7)',[userId,bucket,-amount,'generation_reserved','generation',id,`reserve:${id}:${bucket}`]);
    }
    await client.query('insert into generation_jobs(id,user_id,kind,prompt,prompt_moderation,status,quality,aspect_ratio,duration_seconds,audio,input_image_url,provider,credits_reserved,reservation_breakdown) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id,userId,type,prompt,{allowed:true},'queued',quality,aspectRatio,seconds,audio,imageUrl,process.env.AI_PROVIDER_PRIMARY||'runway',cost,breakdown]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    console.error('[api/generations] reserve failed',String(e).slice(0,700));
    return res.status(500).json({error:'generation_create_failed'});
  } finally { client.release(); }

  try {
    await pool.query("update generation_jobs set status='processing',started_at=now() where id=$1 and status='queued'",[id]);
    const started = await startProvider({id,type,prompt,quality,aspectRatio,seconds,audio,imageUrl});
    if (started.status === 'completed') {
      if (!started.outputUrl) throw new Error('provider_completed_without_output');
      await pool.query("update generation_jobs set provider_job_id=$2,status='completed',output_url=$3,completed_at=now() where id=$1",[id,started.providerJobId,started.outputUrl]);
    } else {
      await pool.query('update generation_jobs set provider_job_id=$2 where id=$1',[id,started.providerJobId]);
    }
  } catch (e) {
    const message = String(e);
    console.error('[api/generations] provider submit failed',message.slice(0,700));
    await refund(id,'provider_submit_failed',message);
    return res.status(502).json({error:'provider_submit_failed',jobId:id,status:'refunded'});
  }

  const out = await pool.query('select id,user_id as "userId",kind as type,status,quality,aspect_ratio as "aspectRatio",duration_seconds as seconds,audio,input_image_url as "inputImageUrl",provider,provider_job_id as "providerJobId",credits_reserved as cost,output_url as "outputUrl",created_at as "createdAt" from generation_jobs where id=$1',[id]);
  return res.status(202).json(out.rows[0]);
}
