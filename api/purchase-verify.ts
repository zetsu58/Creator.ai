import crypto from 'node:crypto';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { GoogleAuth } from 'google-auth-library';
import { pool } from '../backend/src/db.js';
import { requireUser } from '../backend/src/api_auth.js';

const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE || 'ai.veyra.app';
const CREDITS:Record<string,number> = {
  veyra_credits_100:100,
  veyra_credits_500:500,
  veyra_credits_1500:1500,
};

function tokenHash(value:string){return crypto.createHash('sha256').update(value).digest('hex')}

async function googleAccessToken(){
  const raw=process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if(!raw) throw new Error('google_play_not_configured');
  let credentials:any;
  try{credentials=JSON.parse(raw)}catch{throw new Error('google_play_credentials_invalid')}
  const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/androidpublisher']});
  const client=await auth.getClient();
  const access=await client.getAccessToken();
  const token=typeof access==='string'?access:access?.token;
  if(!token) throw new Error('google_play_auth_failed');
  return token;
}

async function verifyGoogle(productId:string,purchaseToken:string){
  const access=await googleAccessToken();
  const url=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(PACKAGE_NAME)}/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const r=await fetch(url,{headers:{authorization:`Bearer ${access}`}});
  const body:any=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`google_play_verify_${r.status}`);
  if(body?.purchaseStateContext?.purchaseState!=='PURCHASED') throw new Error('purchase_not_completed');
  const line=Array.isArray(body?.productLineItem)?body.productLineItem.find((x:any)=>x?.productId===productId):null;
  if(!line) throw new Error('product_mismatch');
  return {access,body};
}

async function consumeGoogle(access:string,productId:string,purchaseToken:string){
  const url=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(PACKAGE_NAME)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`;
  const r=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${access}`,'content-type':'application/json'},body:'{}'});
  if(!r.ok && r.status!==409) console.warn('[purchase-verify] consume failed',r.status);
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
  if(!pool) return res.status(503).json({error:'database_not_configured'});
  const body=req.body&&typeof req.body==='object'?req.body:{};
  const requested=String(body.userId||'').trim();
  const userId=await requireUser(req,requested||null);
  if(!userId) return res.status(401).json({error:'unauthorized'});
  const platform=String(body.platform||'');
  const productId=String(body.productId||'').trim();
  const purchaseToken=String(body.purchaseToken||'').trim();
  const transactionId=String(body.transactionId||'').trim()||`gp:${tokenHash(purchaseToken).slice(0,24)}`;
  if(platform!=='google_play') return res.status(400).json({error:'platform_not_supported_yet'});
  const credits=CREDITS[productId];
  if(!credits||purchaseToken.length<16) return res.status(400).json({error:'invalid_purchase'});

  try{
    const {access,body:google}=await verifyGoogle(productId,purchaseToken);
    const hash=tokenHash(purchaseToken);
    const client=await pool.connect();
    try{
      await client.query('begin');
      const existing=await client.query(`select id,status,credits_granted from purchases where platform='google_play' and (external_transaction_id=$1 or purchase_token_hash=$2) limit 1`,[transactionId,hash]);
      if(existing.rowCount){
        await client.query('rollback');
        const wallet=await pool.query(`select purchased_credits+subscription_credits+promo_credits as credits from wallets where user_id=$1`,[userId]);
        return res.status(200).json({ok:true,idempotent:true,credits:Number(wallet.rows[0]?.credits||0),granted:Number(existing.rows[0].credits_granted||0)});
      }
      const inserted=await client.query(`insert into purchases(user_id,platform,product_id,external_transaction_id,purchase_token_hash,status,credits_granted,raw_reference,verified_at) values($1,'google_play',$2,$3,$4,'verified',$5,$6,now()) returning id`,[userId,productId,transactionId,hash,credits,String(google?.orderId||'').slice(0,200)]);
      await client.query(`update wallets set purchased_credits=purchased_credits+$2,updated_at=now() where user_id=$1`,[userId,credits]);
      await client.query(`insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,'purchased',$2,'google_play_purchase','purchase',$3,$4) on conflict(idempotency_key) do nothing`,[userId,credits,String(inserted.rows[0].id),`google_play:${hash}`]);
      await client.query('commit');
    }catch(e){await client.query('rollback');throw e}finally{client.release()}
    await consumeGoogle(access,productId,purchaseToken);
    const wallet=await pool.query(`select purchased_credits+subscription_credits+promo_credits as credits from wallets where user_id=$1`,[userId]);
    return res.status(200).json({ok:true,granted:credits,credits:Number(wallet.rows[0]?.credits||0)});
  }catch(error:any){
    const code=String(error?.message||'purchase_verification_failed');
    console.error('[purchase-verify]',code.slice(0,180));
    const status=code.includes('not_configured')?503:code.includes('not_completed')||code.includes('mismatch')?409:502;
    return res.status(status).json({error:code});
  }
}
