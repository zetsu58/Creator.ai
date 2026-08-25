import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { ensureGenerationSchema,pool } from '../backend/src/db.js';

const scryptAsync=promisify(crypto.scrypt);
async function derive(password:string,salt:string){return Buffer.from(await scryptAsync(password,salt,64) as ArrayBuffer);}
const hashToken=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');

type DeliveryResult={ok:true}|{ok:false;reason:'not_configured'|'provider_error';status?:number;detail?:string};

async function sendResetEmail(email:string,token:string):Promise<DeliveryResult>{
  const apiKey=process.env.RESEND_API_KEY?.trim();
  const from=(process.env.PASSWORD_RESET_FROM||process.env.RESEND_FROM||process.env.MAIL_FROM)?.trim();
  if(!apiKey||!from){
    console.error('[api/password-reset] email delivery not configured',{apiKey:!!apiKey,from:!!from});
    return {ok:false,reason:'not_configured'};
  }

  const base=(process.env.PASSWORD_RESET_BASE_URL||process.env.PUBLIC_APP_URL||'https://veyra-ai-sigma.vercel.app').trim().replace(/\/$/,'');
  const link=`${base}/forgot-password?token=${encodeURIComponent(token)}`;
  const html=`<!doctype html><html lang="tr"><body style="margin:0;background:#f6f7fb;font-family:Arial,sans-serif;color:#202337"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e7e9f1;border-radius:20px;padding:30px"><div style="font-size:24px;font-weight:800;margin-bottom:18px">VEYRA <span style="color:#7c4dff">AI</span></div><h2 style="margin:0 0 12px">Şifreni sıfırla</h2><p style="line-height:1.6;color:#687086">Veyra AI hesabın için şifre sıfırlama isteği aldık. Aşağıdaki bağlantı 30 dakika boyunca geçerlidir.</p><p style="margin:26px 0"><a href="${link}" style="display:inline-block;background:#7c4dff;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:12px">Şifremi sıfırla</a></p><p style="font-size:13px;line-height:1.5;color:#8a91a3">Bu işlemi sen istemediysen bu e-postayı yok sayabilirsin. Şifren değiştirilmez.</p></div></body></html>`;

  try{
    const r=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
      body:JSON.stringify({from,to:[email],subject:'Veyra AI · Şifre sıfırlama',html})
    });
    if(r.ok) return {ok:true};
    const body=await r.text().catch(()=>'');
    console.error('[api/password-reset] Resend delivery failed',r.status,body.slice(0,500));
    return {ok:false,reason:'provider_error',status:r.status,detail:body.slice(0,160)};
  }catch(e){
    console.error('[api/password-reset] Resend request failed',String(e).slice(0,500));
    return {ok:false,reason:'provider_error',detail:String(e).slice(0,160)};
  }
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
    // Do not reveal whether an email is registered.
    if(!u.rowCount) return res.status(202).json({ok:true});
    if(!String(u.rows[0].external_auth_id||'').startsWith('email:')) return res.status(409).json({error:'password_managed_by_provider'});

    const raw=crypto.randomBytes(32).toString('base64url');
    await pool.query('delete from password_reset_tokens where user_id=$1 or expires_at<now()',[u.rows[0].id]);
    await pool.query("insert into password_reset_tokens(token_hash,user_id,expires_at) values($1,$2,now()+interval '30 minutes')",[hashToken(raw),u.rows[0].id]);

    const delivery=await sendResetEmail(email,raw);
    if(!delivery.ok){
      await pool.query('delete from password_reset_tokens where token_hash=$1',[hashToken(raw)]).catch(()=>{});
      if(delivery.reason==='not_configured') return res.status(503).json({error:'email_delivery_not_configured'});
      return res.status(502).json({error:'email_delivery_failed'});
    }
    return res.status(202).json({ok:true});
  }catch(e){
    console.error('[api/password-reset] failed',String(e).slice(0,500));
    return res.status(500).json({error:'password_reset_failed'});
  }
}
