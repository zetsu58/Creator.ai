import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureGenerationSchema, pool } from '../backend/src/db.js';
import { hashToken } from '../backend/src/api_auth.js';

const DEVICE_COOKIE='veyra_guest_device';
function cookieValue(req:VercelRequest,name:string){
  const raw=String(req.headers.cookie??'');
  for(const part of raw.split(';')){
    const [k,...rest]=part.trim().split('=');
    if(k===name)return decodeURIComponent(rest.join('='));
  }
  return '';
}
function validDeviceKey(value:string){return value.length>=16&&value.length<=256&&/^[A-Za-z0-9._~+-]+$/.test(value)}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});
  if (!pool) return res.status(503).json({error:'database_not_configured'});
  const cookieKey=cookieValue(req,DEVICE_COOKIE).trim();
  const bodyKey=String((req.body ?? {}).deviceKey ?? '').trim();
  const deviceKey=validDeviceKey(cookieKey)?cookieKey:bodyKey;
  if (!validDeviceKey(deviceKey)) return res.status(400).json({error:'invalid_device_key'});

  try {
    await ensureGenerationSchema();
    const deviceHash = crypto.createHash('sha256').update(deviceKey).digest('hex');
    const externalAuthId = `device:${deviceHash}`;
    const guestEmail = `guest+${deviceHash.slice(0,24)}@anonymous.veyra.local`;
    const client = await pool.connect();
    let userId = '';
    let welcomeGranted=false;
    try {
      await client.query('begin');
      let user = await client.query("select id from users where external_auth_id=$1 and status='active' for update",[externalAuthId]);
      let isNew = false;
      if (!user.rowCount) {
        user = await client.query("insert into users(external_auth_id,email,display_name,plan,status) values($1,$2,'Misafir','free','active') returning id",[externalAuthId,guestEmail]);
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
        const granted=await client.query(
          `insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key)
           values($1,'promo',100,'welcome_credits','device',$2,$3)
           on conflict(idempotency_key) do nothing returning id`,
          [userId,deviceHash,`welcome-device:${deviceHash}`],
        );
        welcomeGranted=Boolean(granted.rowCount);
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
    res.setHeader('Set-Cookie',`${DEVICE_COOKIE}=${encodeURIComponent(deviceKey)}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax`);
    return res.status(201).json({userId,token,expiresAt:expiresAt.toISOString(),guest:true,welcomeGranted});
  } catch (error) {
    console.error('[api/auth-anonymous] failed',String(error).slice(0,500));
    return res.status(500).json({error:'auth_failed'});
  }
}
