import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { databaseHealth,ensureGenerationSchema,pool } from '../backend/src/db.js';
import { requireUser } from '../backend/src/api_auth.js';

const scryptAsync=promisify(crypto.scrypt);
async function derive(password:string,salt:string){return Buffer.from(await scryptAsync(password,salt,64) as ArrayBuffer);}

async function requireAdmin(userId:string){
  if(!pool) return null;
  const r=await pool.query("select id,email,role from users where id=$1 and status='active' limit 1",[userId]);
  if(!r.rowCount||String(r.rows[0].role||'USER').toUpperCase()!=='ADMIN') return null;
  return {id:String(r.rows[0].id),email:String(r.rows[0].email||''),role:'ADMIN'};
}

async function listUsers(){
  if(!pool) return [];
  const r=await pool.query(`select u.id,u.email,u.display_name as "displayName",u.plan,u.role,u.status,u.created_at as "createdAt",
    coalesce(w.purchased_credits,0) as purchased,coalesce(w.subscription_credits,0) as subscription,coalesce(w.promo_credits,0) as promo,
    coalesce(w.purchased_credits,0)+coalesce(w.subscription_credits,0)+coalesce(w.promo_credits,0) as credits,
    (select count(*)::int from generation_jobs g where g.user_id=u.id) as generations
    from users u left join wallets w on w.user_id=u.id order by u.created_at desc limit 200`);
  return r.rows;
}

async function adjustCredits(adminId:string,targetUserId:string,operation:string,amount:number){
  if(!pool) throw new Error('database_not_configured');
  if(!/^[0-9a-f-]{36}$/i.test(targetUserId)) throw new Error('invalid_target_user');
  if(!Number.isSafeInteger(amount)||amount<1||amount>1_000_000) throw new Error('invalid_credit_amount');
  if(operation!=='add'&&operation!=='remove') throw new Error('invalid_credit_operation');
  const client=await pool.connect();
  try{
    await client.query('begin');
    const user=await client.query("select id from users where id=$1 and status='active' for update",[targetUserId]);
    if(!user.rowCount) throw new Error('target_user_not_found');
    await client.query('insert into wallets(user_id) values($1) on conflict(user_id) do nothing',[targetUserId]);
    const wallet=await client.query('select purchased_credits,subscription_credits,promo_credits from wallets where user_id=$1 for update',[targetUserId]);
    const purchased=Number(wallet.rows[0]?.purchased_credits||0),subscription=Number(wallet.rows[0]?.subscription_credits||0),promo=Number(wallet.rows[0]?.promo_credits||0);
    const total=purchased+subscription+promo;
    if(operation==='remove'&&total<amount) throw new Error('insufficient_user_credits');
    let dp=0,ds=0,dm=0;
    if(operation==='add') dm=amount;
    else {let remaining=amount;dm=-Math.min(promo,remaining);remaining+=dm;ds=-Math.min(subscription,remaining);remaining+=ds;dp=-Math.min(purchased,remaining);}
    await client.query(`update wallets set purchased_credits=purchased_credits+$2,subscription_credits=subscription_credits+$3,promo_credits=promo_credits+$4,updated_at=now() where user_id=$1`,[targetUserId,dp,ds,dm]);
    const ref=crypto.randomUUID();
    for(const [bucket,delta] of Object.entries({purchased:dp,subscription:ds,promo:dm})) if(Number(delta)!==0) await client.query(`insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,$2,$3,'admin_manual_adjustment','admin',$4,$5)`,[targetUserId,bucket,Number(delta),ref,`admin:${ref}:${bucket}`]);
    await client.query(`insert into admin_audit_log(admin_user_id,target_user_id,action,metadata) values($1,$2,$3,$4::jsonb)`,[adminId,targetUserId,`credit_${operation}`,JSON.stringify({amount,referenceId:ref})]);
    const updated=await client.query(`select purchased_credits as purchased,subscription_credits as subscription,promo_credits as promo,purchased_credits+subscription_credits+promo_credits as credits from wallets where user_id=$1`,[targetUserId]);
    await client.query('commit'); return updated.rows[0];
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(!pool) return res.status(503).json({error:'database_not_configured'});
  try{
    await ensureGenerationSchema();
    const userId=await requireUser(req);
    if(!userId) return res.status(401).json({error:'unauthorized'});
    const queryAction=String(req.query.action??'').trim();
    const adminActions=['overview','users','credit','generations','purchases','audit','user_status'];
    if(adminActions.includes(queryAction)){
      const admin=await requireAdmin(userId);
      if(!admin) return res.status(403).json({error:'admin_required'});
      if(req.method==='GET'&&queryAction==='overview'){
        const [health,users,counts]=await Promise.all([databaseHealth(),listUsers(),pool.query(`select (select count(*)::int from users) as users,(select count(*)::int from generation_jobs) as jobs,(select count(*)::int from generation_jobs where status in ('queued','processing')) as queued,(select count(*)::int from generation_jobs where status='completed') as completed,(select count(*)::int from purchases where status in ('verified','completed','paid')) as purchases`)]);
        return res.status(200).json({admin,health:{database:health.ok,api:true},summary:counts.rows[0],users});
      }
      if(req.method==='GET'&&queryAction==='users') return res.status(200).json({items:await listUsers()});
      if(req.method==='GET'&&queryAction==='generations'){
        const r=await pool.query(`select g.id,g.kind,g.status,g.quality,g.credits_reserved as credits,g.provider,g.provider_job_id as "providerJobId",g.created_at as "createdAt",u.email,u.display_name as "displayName" from generation_jobs g join users u on u.id=g.user_id order by g.created_at desc limit 200`);
        return res.status(200).json({items:r.rows});
      }
      if(req.method==='GET'&&queryAction==='purchases'){
        const r=await pool.query(`select p.id,p.platform,p.product_id as "productId",p.status,p.amount_minor as "amountMinor",p.currency,p.credits_granted as "creditsGranted",p.created_at as "createdAt",u.email from purchases p join users u on u.id=p.user_id order by p.created_at desc limit 200`);
        return res.status(200).json({items:r.rows});
      }
      if(req.method==='GET'&&queryAction==='audit'){
        const r=await pool.query(`select a.id,a.action,a.metadata,a.created_at as "createdAt",au.email as "adminEmail",tu.email as "targetEmail" from admin_audit_log a join users au on au.id=a.admin_user_id left join users tu on tu.id=a.target_user_id order by a.created_at desc limit 200`);
        return res.status(200).json({items:r.rows});
      }
      if(req.method==='POST'&&queryAction==='credit'){
        const targetUserId=String((req.body??{}).userId??'').trim(); const operation=String((req.body??{}).operation??'').trim(); const amount=Number((req.body??{}).amount);
        return res.status(200).json({ok:true,wallet:await adjustCredits(admin.id,targetUserId,operation,amount)});
      }
      if(req.method==='POST'&&queryAction==='user_status'){
        const targetUserId=String((req.body??{}).userId??'').trim(); const status=String((req.body??{}).status??'').trim();
        if(!/^[0-9a-f-]{36}$/i.test(targetUserId)||!['active','disabled'].includes(status)) return res.status(400).json({error:'invalid_user_status'});
        if(targetUserId===admin.id&&status!=='active') return res.status(400).json({error:'cannot_disable_self'});
        const r=await pool.query('update users set status=$2,updated_at=now() where id=$1 returning id,status',[targetUserId,status]);
        if(!r.rowCount) return res.status(404).json({error:'target_user_not_found'});
        await pool.query(`insert into admin_audit_log(admin_user_id,target_user_id,action,metadata) values($1,$2,'user_status_change',$3::jsonb)`,[admin.id,targetUserId,JSON.stringify({status})]);
        return res.status(200).json({ok:true,user:r.rows[0]});
      }
      return res.status(405).json({error:'method_or_action_not_allowed'});
    }

    if(req.method==='GET'){
      const r=await pool.query(`select u.id,u.email,u.display_name as "displayName",u.plan,u.role,u.created_at as "createdAt",u.external_auth_id as "externalAuthId",coalesce(w.purchased_credits,0) as purchased,coalesce(w.subscription_credits,0) as subscription,coalesce(w.promo_credits,0) as promo,coalesce(w.purchased_credits,0)+coalesce(w.subscription_credits,0)+coalesce(w.promo_credits,0) as credits from users u left join wallets w on w.user_id=u.id where u.id=$1 and u.status='active'`,[userId]);
      if(!r.rowCount) return res.status(404).json({error:'user_not_found'});
      const row=r.rows[0],role=String(row.role||'USER').toUpperCase();
      return res.status(200).json({...row,role,isAdmin:role==='ADMIN',authType:String(row.externalAuthId||'').startsWith('email:')?'email':String(row.externalAuthId||'').startsWith('firebase:')?'social':'guest',externalAuthId:undefined});
    }
    if(req.method!=='PATCH'&&req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
    const action=String((req.body??{}).action??'profile');
    if(action==='profile'){const displayName=String((req.body??{}).displayName??'').trim().replace(/\s+/g,' ').slice(0,80);if(displayName.length<2)return res.status(400).json({error:'invalid_display_name'});await pool.query('update users set display_name=$2,updated_at=now() where id=$1',[userId,displayName]);return res.status(200).json({ok:true,displayName});}
    if(action==='change_password'){
      const current=String((req.body??{}).currentPassword??''),next=String((req.body??{}).newPassword??''); if(next.length<8||next.length>128)return res.status(400).json({error:'invalid_new_password'});
      const r=await pool.query('select password_salt,password_hash,external_auth_id from users where id=$1',[userId]); if(!r.rowCount)return res.status(404).json({error:'user_not_found'}); if(!String(r.rows[0].external_auth_id||'').startsWith('email:'))return res.status(409).json({error:'password_managed_by_provider'});
      const salt=String(r.rows[0].password_salt||''),hash=String(r.rows[0].password_hash||''); if(!salt||!hash)return res.status(409).json({error:'password_not_set'}); const actual=await derive(current,salt),expected=Buffer.from(hash,'hex'); if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return res.status(401).json({error:'current_password_incorrect'});
      const newSalt=crypto.randomBytes(16).toString('hex'),newHash=(await derive(next,newSalt)).toString('hex'); await pool.query('update users set password_salt=$2,password_hash=$3,updated_at=now() where id=$1',[userId,newSalt,newHash]); return res.status(200).json({ok:true});
    }
    return res.status(400).json({error:'invalid_action'});
  }catch(e){const msg=String(e instanceof Error?e.message:e);const known=['invalid_target_user','invalid_credit_amount','invalid_credit_operation','target_user_not_found','insufficient_user_credits'];if(known.includes(msg))return res.status(400).json({error:msg});console.error('[api/profile] failed',msg.slice(0,500));return res.status(500).json({error:'profile_failed'});}
}
