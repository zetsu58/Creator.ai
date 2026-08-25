import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { ensureGenerationSchema,pool } from '../backend/src/db.js';

const scryptAsync=promisify(crypto.scrypt);
async function derive(password:string,salt:string){return Buffer.from(await scryptAsync(password,salt,64) as ArrayBuffer);}
const hashToken=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');

async function sendResetEmail(email:string,token:string){
  const apiKey=process.env.RESEND_API_KEY?.trim();
  const from=process.env.PASSWORD_RESET_FROM?.trim();
  if(!apiKey||!from) return false;
  const base=process.env.PASSWORD_RESET_BASE_URL?.trim()||'https://veyra-ai-sigma.vercel.app';
  const link=`${base}/forgot-password?token=${encodeURIComponent(token)}`;
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({from,to:[email],subject:'Veyra AI şifre sıfırlama',html:`<p>Veyra AI hesabın için şifre sıfırlama bağlantısı:</p><p><a href="${link}">Şifremi sıfırla</a></p><p>Bu bağlantı 30 dakika geçerlidir.</p>`})});
  return r.ok;
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
  if(!pool) return res.status(503).json({error:'database_not_configured'});
  try{
    await ensureGenerationSchema();
    const token=String((req.body??{}).token??'').trim();
    const newPassword=String((req.body??{}).newPassword??'');
    if(token){
      if(newPassword.length<8||newPassword.length>128) return res.status(400).json({error:'invalid_new_password'});
      const r=await pool.query(`select t.user_id as "userId" from password_reset_tokens t join users u on u.id=t.user_id where t.token_hash=$1 and t.expires_at>now() and t.used_at is null and u.status='active' limit 1`,[hashToken(token)]);
      if(!r.rowCount) return res.status(400).json({error:'invalid_or_expired_token'});
      const salt=crypto.randomBytes(16).toString('hex');
      const hash=(await derive(newPassword,salt)).toString('hex');
      const client=await pool.connect();
      try{await client.query('begin');await client.query('update users set password_salt=$2,password_hash=$3,updated_at=now() where id=$1',[r.rows[0].userId,salt,hash]);await client.query('update password_reset_tokens set used_at=now() where token_hash=$1',[hashToken(token)]);await client.query('delete from api_sessions where user_id=$1',[r.rows[0].userId]);await client.query('commit');}catch(e){await client.query('rollback');throw e;}finally{client.release();}
      return res.status(200).json({ok:true});
    }
    const email=String((req.body??{}).email??'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'invalid_email'});
    const u=await pool.query("select id,external_auth_id from users where lower(email)=lower($1) and status='active' limit 1",[email]);
    if(!u.rowCount) return res.status(202).json({ok:true});
    if(!String(u.rows[0].external_auth_id||'').startsWith('email:')) return res.status(409).json({error:'password_managed_by_provider'});
    const raw=crypto.randomBytes(32).toString('base64url');
    await pool.query('delete from password_reset_tokens where user_id=$1 or expires_at<now()',[u.rows[0].id]);
    await pool.query("insert into password_reset_tokens(token_hash,user_id,expires_at) values($1,$2,now()+interval '30 minutes')",[hashToken(raw),u.rows[0].id]);
    const sent=await sendResetEmail(email,raw);
    if(!sent) return res.status(503).json({error:'email_delivery_not_configured'});
    return res.status(202).json({ok:true});
  }catch(e){console.error('[api/password-reset] failed',String(e).slice(0,500));return res.status(500).json({error:'password_reset_failed'});}
}
