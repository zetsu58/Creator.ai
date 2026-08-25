import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureGenerationSchema, pool } from '../backend/src/db.js';
import { hashToken } from '../backend/src/api_auth.js';

const scryptAsync = promisify(crypto.scrypt);

async function derive(password:string,salt:string){
  return Buffer.from(await scryptAsync(password,salt,64) as ArrayBuffer);
}

async function issueSession(userId:string){
  if(!pool) throw new Error('database_not_configured');
  const token=crypto.randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+30*24*60*60*1000);
  await pool.query('insert into api_sessions(token_hash,user_id,expires_at) values($1,$2,$3)',[hashToken(token),userId,expiresAt]);
  return {userId,token,expiresAt:expiresAt.toISOString()};
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
  if(!pool) return res.status(503).json({error:'database_not_configured'});
  const action=String((req.body??{}).action??'').trim();
  const email=String((req.body??{}).email??'').trim().toLowerCase();
  const password=String((req.body??{}).password??'');
  const displayName=String((req.body??{}).displayName??'').trim().slice(0,80);
  if(!['register','login'].includes(action)) return res.status(400).json({error:'invalid_action'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<8 || password.length>128) return res.status(400).json({error:'invalid_credentials_format'});
  try{
    await ensureGenerationSchema();
    if(action==='register'){
      const existing=await pool.query('select id from users where lower(email)=lower($1) limit 1',[email]);
      if(existing.rowCount) return res.status(409).json({error:'email_already_registered'});
      const salt=crypto.randomBytes(16).toString('hex');
      const hash=(await derive(password,salt)).toString('hex');
      const client=await pool.connect();
      let userId='';
      try{
        await client.query('begin');
        const u=await client.query("insert into users(email,display_name,password_salt,password_hash,external_auth_id,plan,status) values($1,$2,$3,$4,$5,'free','active') returning id",[email,displayName||null,salt,hash,`email:${email}`]);
        userId=String(u.rows[0].id);
        await client.query('insert into wallets(user_id,promo_credits) values($1,100) on conflict(user_id) do nothing',[userId]);
        await client.query("insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,'promo',100,'welcome_credits','account',$1,$2) on conflict do nothing",[userId,`welcome:${userId}`]);
        await client.query('commit');
      }catch(e){await client.query('rollback');throw e;}finally{client.release();}
      return res.status(201).json(await issueSession(userId));
    }
    const r=await pool.query("select id,password_salt,password_hash from users where lower(email)=lower($1) and status='active' limit 1",[email]);
    if(!r.rowCount || !r.rows[0].password_salt || !r.rows[0].password_hash) return res.status(401).json({error:'invalid_email_or_password'});
    const actual=await derive(password,String(r.rows[0].password_salt));
    const expected=Buffer.from(String(r.rows[0].password_hash),'hex');
    if(expected.length!==actual.length || !crypto.timingSafeEqual(expected,actual)) return res.status(401).json({error:'invalid_email_or_password'});
    return res.status(200).json(await issueSession(String(r.rows[0].id)));
  }catch(e){
    console.error('[api/auth-email] failed',String(e).slice(0,500));
    return res.status(500).json({error:'auth_failed'});
  }
}
