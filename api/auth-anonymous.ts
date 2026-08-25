import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureGenerationSchema, pool } from '../backend/src/db.js';
import { hashToken } from '../backend/src/api_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});
  if (!pool) return res.status(503).json({error:'database_not_configured'});
  const deviceKey = String((req.body ?? {}).deviceKey ?? '').trim();
  if (deviceKey.length < 16 || deviceKey.length > 256) return res.status(400).json({error:'invalid_device_key'});

  try {
    await ensureGenerationSchema();
    const externalAuthId = `device:${crypto.createHash('sha256').update(deviceKey).digest('hex')}`;
    const client = await pool.connect();
    let userId = '';
    try {
      await client.query('begin');
      let user = await client.query("select id from users where external_auth_id=$1 and status='active' for update",[externalAuthId]);
      let isNew = false;
      if (!user.rowCount) {
        user = await client.query("insert into users(external_auth_id,plan,status) values($1,'free','active') returning id",[externalAuthId]);
        isNew = true;
      }
      userId = String(user.rows[0].id);
      await client.query(
        `insert into wallets(user_id,promo_credits)
         values($1,$2)
         on conflict(user_id) do nothing`,
        [userId,isNew ? 100 : 0],
      );
      if (isNew) {
        await client.query(
          `insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key)
           values($1,'promo',100,'welcome_credits','account',$1,$2) on conflict do nothing`,
          [userId,`welcome:${userId}`],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now()+30*24*60*60*1000);
    await pool.query(
      `insert into api_sessions(token_hash,user_id,expires_at) values($1,$2,$3)
       on conflict(token_hash) do nothing`,
      [hashToken(token),userId,expiresAt],
    );
    await pool.query('delete from api_sessions where expires_at<now()');
    return res.status(201).json({userId,token,expiresAt:expiresAt.toISOString()});
  } catch (error) {
    console.error('[api/auth-anonymous] failed',String(error).slice(0,500));
    return res.status(500).json({error:'auth_failed'});
  }
}
