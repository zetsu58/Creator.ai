import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { ensureGenerationSchema,pool } from '../backend/src/db.js';
import { requireUser } from '../backend/src/api_auth.js';

const scryptAsync=promisify(crypto.scrypt);
async function derive(password:string,salt:string){return Buffer.from(await scryptAsync(password,salt,64) as ArrayBuffer);}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(!pool) return res.status(503).json({error:'database_not_configured'});
  try{
    await ensureGenerationSchema();
    const userId=await requireUser(req);
    if(!userId) return res.status(401).json({error:'unauthorized'});

    if(req.method==='GET'){
      const r=await pool.query(`select u.id,u.email,u.display_name as "displayName",u.plan,u.created_at as "createdAt",u.external_auth_id as "externalAuthId",
        coalesce(w.purchased_credits,0) as purchased,coalesce(w.subscription_credits,0) as subscription,coalesce(w.promo_credits,0) as promo,
        coalesce(w.purchased_credits,0)+coalesce(w.subscription_credits,0)+coalesce(w.promo_credits,0) as credits
        from users u left join wallets w on w.user_id=u.id where u.id=$1 and u.status='active'`,[userId]);
      if(!r.rowCount) return res.status(404).json({error:'user_not_found'});
      const row=r.rows[0];
      return res.status(200).json({...row,authType:String(row.externalAuthId||'').startsWith('email:')?'email':String(row.externalAuthId||'').startsWith('firebase:')?'social':'guest',externalAuthId:undefined});
    }

    if(req.method!=='PATCH'&&req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
    const action=String((req.body??{}).action??'profile');
    if(action==='profile'){
      const displayName=String((req.body??{}).displayName??'').trim().replace(/\s+/g,' ').slice(0,80);
      if(displayName.length<2) return res.status(400).json({error:'invalid_display_name'});
      await pool.query('update users set display_name=$2,updated_at=now() where id=$1',[userId,displayName]);
      return res.status(200).json({ok:true,displayName});
    }

    if(action==='change_password'){
      const current=String((req.body??{}).currentPassword??'');
      const next=String((req.body??{}).newPassword??'');
      if(next.length<8||next.length>128) return res.status(400).json({error:'invalid_new_password'});
      const r=await pool.query('select password_salt,password_hash,external_auth_id from users where id=$1',[userId]);
      if(!r.rowCount) return res.status(404).json({error:'user_not_found'});
      if(!String(r.rows[0].external_auth_id||'').startsWith('email:')) return res.status(409).json({error:'password_managed_by_provider'});
      const salt=String(r.rows[0].password_salt||''),hash=String(r.rows[0].password_hash||'');
      if(!salt||!hash) return res.status(409).json({error:'password_not_set'});
      const actual=await derive(current,salt),expected=Buffer.from(hash,'hex');
      if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected)) return res.status(401).json({error:'current_password_incorrect'});
      const newSalt=crypto.randomBytes(16).toString('hex');
      const newHash=(await derive(next,newSalt)).toString('hex');
      await pool.query('update users set password_salt=$2,password_hash=$3,updated_at=now() where id=$1',[userId,newSalt,newHash]);
      return res.status(200).json({ok:true});
    }
    return res.status(400).json({error:'invalid_action'});
  }catch(e){
    console.error('[api/profile] failed',String(e).slice(0,500));
    return res.status(500).json({error:'profile_failed'});
  }
}
