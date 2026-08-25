import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool } from '../backend/src/db.js';
import { sessionsConfigured, verifySession } from '../backend/src/session.js';

function bearer(req: VercelRequest) {
  return String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
}

function authorized(req: VercelRequest, userId: string) {
  if (sessionsConfigured()) return verifySession(bearer(req))?.userId === userId;
  return String(process.env.VEYRA_REQUIRE_AUTH ?? 'false').toLowerCase() !== 'true';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({error:'method_not_allowed'});
  if (!pool) return res.status(503).json({error:'database_not_configured'});

  const userId = String(req.query.userId ?? '').trim();
  if (!userId) return res.status(400).json({error:'missing_user_id'});
  if (!authorized(req, userId)) return res.status(401).json({error:'unauthorized'});

  try {
    const r = await pool.query(
      `select id,user_id as "userId",kind as type,prompt,status,quality,
              aspect_ratio as "aspectRatio",duration_seconds as seconds,audio,
              input_image_url as "inputImageUrl",provider,provider_job_id as "providerJobId",
              credits_reserved as cost,output_url as "outputUrl",failure_code as "failureCode",
              failure_message as "failureMessage",refunded_at as "refundedAt",
              created_at as "createdAt",completed_at as "completedAt"
       from generation_jobs where user_id=$1 order by created_at desc limit 100`,
      [userId],
    );
    return res.status(200).json({items:r.rows});
  } catch (error) {
    console.error('[api/user-generations] failed', String(error).slice(0,500));
    return res.status(500).json({error:'generation_history_failed'});
  }
}
