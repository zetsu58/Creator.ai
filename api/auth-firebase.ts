import crypto from 'node:crypto';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { ensureGenerationSchema,pool } from '../backend/src/db.js';
import { hashToken } from '../backend/src/api_auth.js';
import { verifyFirebaseIdToken } from '../backend/src/firebase_admin.js';

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
  const idToken=String((req.body??{}).idToken??'').trim();
  if(idToken.length<100 || idToken.length>10000) return res.status(400).json({error:'invalid_id_token'});
  try{
    await ensureGenerationSchema();
    const decoded=await verifyFirebaseIdToken(idToken);
    const provider=String(decoded.firebase?.sign_in_provider||'firebase');
    if(!['google.com','apple.com','password'].includes(provider)) return res.status(403).json({error:'unsupported_auth_provider'});
    const externalAuthId=`firebase:${decoded.uid}`;
    const email=decoded.email?String(decoded.email).toLowerCase():null;
    const name=decoded.name?String(decoded.name).slice(0,80):null;
    const client=await pool.connect();
    let userId='';
    let isNew=false;
    try{
      await client.query('begin');
      let r=await client.query("select id from users where external_auth_id=$1 and status='active' for update",[externalAuthId]);
      if(!r.rowCount && email) r=await client.query("select id from users where lower(email)=lower($1) and status='active' for update",[email]);
      if(!r.rowCount){
        r=await client.query("insert into users(external_auth_id,email,display_name,plan,status) values($1,$2,$3,'free','active') returning id",[externalAuthId,email,name]);
        isNew=true;
      }else{
        await client.query('update users set external_auth_id=coalesce(external_auth_id,$2),email=coalesce(email,$3),display_name=coalesce(display_name,$4),updated_at=now() where id=$1',[r.rows[0].id,externalAuthId,email,name]);
      }
      userId=String(r.rows[0].id);
      await client.query('insert into wallets(user_id,promo_credits) values($1,$2) on conflict(user_id) do nothing',[userId,isNew?100:0]);
      if(isNew) await client.query("insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,'promo',100,'welcome_credits','account',$1,$2) on conflict do nothing",[userId,`welcome:${userId}`]);
      await client.query('commit');
    }catch(e){await client.query('rollback');throw e;}finally{client.release();}
    return res.status(200).json(await issueSession(userId));
  }catch(e){
    console.error('[api/auth-firebase] failed',String(e).slice(0,500));
    return res.status(401).json({error:'firebase_auth_failed'});
  }
}
