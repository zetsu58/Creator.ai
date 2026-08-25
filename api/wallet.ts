import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleAuth } from 'google-auth-library';
import { AppStoreServerAPIClient, Environment, SignedDataVerifier } from '@apple/app-store-server-library';
import { pool } from '../backend/src/db.js';
import { requireUser } from '../backend/src/api_auth.js';

const GOOGLE_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE || 'ai.veyra.app';
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'ai.veyra.app';
const PRODUCTS = [
  {id:'veyra_credits_100',title:'Starter',credits:100,type:'consumable',badge:null},
  {id:'veyra_credits_500',title:'Creator',credits:500,type:'consumable',badge:'Popüler'},
  {id:'veyra_credits_1500',title:'Pro Pack',credits:1500,type:'consumable',badge:'En iyi değer'},
] as const;
const CREDITS: Record<string,number> = Object.fromEntries(PRODUCTS.map(p=>[p.id,p.credits]));

function tokenHash(value:string){return crypto.createHash('sha256').update(value).digest('hex');}
function quoteCost(type:string,quality:string,audio:boolean,draft:boolean,seconds:number){
  if(type==='image'||type==='magic_edit') return quality==='fast'?5:10;
  if(type==='product_ad'||type==='headshot') return quality==='fast'?12:22;
  const per=quality==='fast'?5:quality==='pro'?8:12;
  const normal=Math.max(20,seconds*per+(audio?8:0));
  return draft?Math.max(8,Math.ceil(normal*.35)):normal;
}

async function googleAccessToken(){
  const raw=process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if(!raw) throw new Error('google_play_not_configured');
  let credentials:any;
  try{credentials=JSON.parse(raw);}catch{throw new Error('google_play_credentials_invalid');}
  const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/androidpublisher']});
  const client=await auth.getClient();
  const access=await client.getAccessToken();
  const token=typeof access==='string'?access:access?.token;
  if(!token) throw new Error('google_play_auth_failed');
  return token;
}

async function verifyGoogle(productId:string,purchaseToken:string){
  const access=await googleAccessToken();
  const url=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PACKAGE_NAME)}/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const r=await fetch(url,{headers:{authorization:`Bearer ${access}`}});
  const body:any=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`google_play_verify_${r.status}`);
  if(body?.purchaseStateContext?.purchaseState!=='PURCHASED') throw new Error('purchase_not_completed');
  const line=Array.isArray(body?.productLineItem)?body.productLineItem.find((x:any)=>x?.productId===productId):null;
  if(!line) throw new Error('product_mismatch');
  return {access,body};
}

async function consumeGoogle(access:string,productId:string,purchaseToken:string){
  const url=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PACKAGE_NAME)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`;
  const r=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${access}`,'content-type':'application/json'},body:'{}'});
  if(!r.ok&&r.status!==409) console.warn('[api/wallet] Google consume failed',r.status);
}

function applePrivateKey(){
  const raw=String(process.env.APPLE_IAP_PRIVATE_KEY||'').trim();
  if(!raw) throw new Error('apple_iap_not_configured');
  return raw.replace(/\\n/g,'\n');
}
function appleRootCAs(){
  const raw=String(process.env.APPLE_ROOT_CA_B64||'').trim();
  if(!raw) throw new Error('apple_root_ca_not_configured');
  return raw.split(',').map(x=>x.trim()).filter(Boolean).map(x=>Buffer.from(x,'base64'));
}
function appleConfig(){
  const issuer=String(process.env.APPLE_IAP_ISSUER_ID||'').trim();
  const keyId=String(process.env.APPLE_IAP_KEY_ID||'').trim();
  const appIdRaw=String(process.env.APPLE_APP_ID||'').trim();
  const appAppleId=appIdRaw?Number(appIdRaw):undefined;
  if(!issuer||!keyId) throw new Error('apple_iap_not_configured');
  return {issuer,keyId,appAppleId};
}

async function verifyAppleInEnvironment(transactionId:string, env:Environment){
  const {issuer,keyId,appAppleId}=appleConfig();
  if(env===Environment.PRODUCTION && !appAppleId) throw new Error('apple_app_id_not_configured');
  const client=new AppStoreServerAPIClient(applePrivateKey(),keyId,issuer,APPLE_BUNDLE_ID,env);
  const response=await client.getTransactionInfo(transactionId);
  const signed=String(response.signedTransactionInfo||'');
  if(!signed) throw new Error('apple_transaction_missing');
  const verifier=new SignedDataVerifier(appleRootCAs(),true,env,APPLE_BUNDLE_ID,env===Environment.PRODUCTION?appAppleId:undefined);
  const decoded:any=await verifier.verifyAndDecodeTransaction(signed);
  return {decoded,signed,environment:env};
}

async function verifyApple(productId:string,transactionId:string){
  let verified:any;
  try{verified=await verifyAppleInEnvironment(transactionId,Environment.PRODUCTION);}
  catch(prodError){
    try{verified=await verifyAppleInEnvironment(transactionId,Environment.SANDBOX);}
    catch{throw prodError;}
  }
  const tx=verified.decoded;
  if(String(tx?.transactionId||'')!==transactionId) throw new Error('apple_transaction_mismatch');
  if(String(tx?.productId||'')!==productId) throw new Error('product_mismatch');
  if(String(tx?.bundleId||'')!==APPLE_BUNDLE_ID) throw new Error('apple_bundle_mismatch');
  if(tx?.revocationDate) throw new Error('apple_purchase_revoked');
  return verified;
}

async function grantPurchaseCredits(args:{userId:string;platform:'google_play'|'apple';productId:string;transactionId:string;tokenHashValue:string;credits:number;rawReference:string}){
  if(!pool) throw new Error('database_not_configured');
  const client=await pool.connect();
  try{
    await client.query('begin');
    const existing=await client.query(`select id,status,credits_granted,user_id from purchases where platform=$1 and (external_transaction_id=$2 or purchase_token_hash=$3) limit 1 for update`,[args.platform,args.transactionId,args.tokenHashValue]);
    if(existing.rowCount){
      if(String(existing.rows[0].user_id)!==args.userId) throw new Error('purchase_owned_by_other_user');
      await client.query('rollback');
      const w=await pool.query(`select purchased_credits+subscription_credits+promo_credits as credits from wallets where user_id=$1`,[args.userId]);
      return {idempotent:true,granted:Number(existing.rows[0].credits_granted||0),credits:Number(w.rows[0]?.credits||0)};
    }
    const inserted=await client.query(`insert into purchases(user_id,platform,product_id,external_transaction_id,purchase_token_hash,status,credits_granted,raw_reference,verified_at) values($1,$2,$3,$4,$5,'verified',$6,$7,now()) returning id`,[args.userId,args.platform,args.productId,args.transactionId,args.tokenHashValue,args.credits,args.rawReference.slice(0,500)]);
    await client.query(`update wallets set purchased_credits=purchased_credits+$2,updated_at=now() where user_id=$1`,[args.userId,args.credits]);
    await client.query(`insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,'purchased',$2,$3,'purchase',$4,$5) on conflict(idempotency_key) do nothing`,[args.userId,args.credits,args.platform==='apple'?'app_store_purchase':'google_play_purchase',String(inserted.rows[0].id),`${args.platform}:${args.tokenHashValue}`]);
    await client.query('commit');
    const w=await pool.query(`select purchased_credits+subscription_credits+promo_credits as credits from wallets where user_id=$1`,[args.userId]);
    return {idempotent:false,granted:args.credits,credits:Number(w.rows[0]?.credits||0)};
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action=String(req.query.action??'wallet');
  if(action==='products'){
    if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
    return res.status(200).json({items:PRODUCTS});
  }
  if(action==='quote'){
    if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
    const b=req.body&&typeof req.body==='object'?req.body:{};
    const type=String((b as any).type||''),quality=String((b as any).quality||'fast'),seconds=Number((b as any).seconds||0),audio=Boolean((b as any).audio),draft=Boolean((b as any).draft);
    if(!['image','video','product_ad','headshot','magic_edit'].includes(type)||!['fast','pro','cinematic'].includes(quality)||!Number.isFinite(seconds)||seconds<0||seconds>60) return res.status(400).json({error:'invalid_request'});
    return res.status(200).json({credits:quoteCost(type,quality,audio,draft,Math.floor(seconds))});
  }
  if(!pool) return res.status(503).json({error:'database_not_configured'});
  const requested=String((req.query.userId??(req.body&&typeof req.body==='object'?(req.body as any).userId:''))||'').trim();
  const userId=await requireUser(req,requested||null);
  if(!userId) return res.status(401).json({error:'unauthorized'});
  try{
    if(action==='ledger'){
      if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
      const r=await pool.query(`select id,bucket,delta,reason,reference_type as "referenceType",reference_id as "referenceId",created_at as "createdAt" from credit_ledger where user_id=$1 order by created_at desc limit 100`,[userId]);
      return res.status(200).json({items:r.rows});
    }
    if(action==='purchases'){
      if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
      const r=await pool.query(`select id,platform,product_id as "productId",external_transaction_id as "transactionId",status,credits_granted as "creditsGranted",created_at as "createdAt",verified_at as "verifiedAt" from purchases where user_id=$1 order by created_at desc limit 100`,[userId]);
      return res.status(200).json({items:r.rows});
    }
    if(action==='verify_purchase'){
      if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
      const body=req.body&&typeof req.body==='object'?req.body as any:{};
      const platform=String(body.platform||''),productId=String(body.productId||'').trim(),purchaseToken=String(body.purchaseToken||'').trim();
      const suppliedTransactionId=String(body.transactionId||'').trim();
      const credits=CREDITS[productId];
      if(!credits) return res.status(400).json({error:'invalid_product'});

      if(platform==='google_play'){
        if(purchaseToken.length<16) return res.status(400).json({error:'invalid_purchase'});
        const transactionId=suppliedTransactionId||`gp:${tokenHash(purchaseToken).slice(0,24)}`;
        try{
          const {access,body:google}=await verifyGoogle(productId,purchaseToken);
          const result=await grantPurchaseCredits({userId,platform:'google_play',productId,transactionId,tokenHashValue:tokenHash(purchaseToken),credits,rawReference:String(google?.orderId||transactionId)});
          if(!result.idempotent) await consumeGoogle(access,productId,purchaseToken);
          return res.status(200).json({ok:true,...result});
        }catch(error:any){
          const code=String(error?.message||'purchase_verification_failed');
          console.error('[api/wallet google purchase]',code.slice(0,180));
          const status=code.includes('not_configured')?503:code.includes('not_completed')||code.includes('mismatch')||code.includes('owned_by_other_user')?409:502;
          return res.status(status).json({error:code});
        }
      }

      if(platform==='apple'){
        if(!suppliedTransactionId||suppliedTransactionId.length<4) return res.status(400).json({error:'apple_transaction_id_required'});
        try{
          const verified=await verifyApple(productId,suppliedTransactionId);
          const tokenRef=purchaseToken||verified.signed;
          const result=await grantPurchaseCredits({userId,platform:'apple',productId,transactionId:suppliedTransactionId,tokenHashValue:tokenHash(tokenRef),credits,rawReference:`${String(verified.decoded?.environment||'')}|${suppliedTransactionId}`});
          return res.status(200).json({ok:true,...result});
        }catch(error:any){
          const code=String(error?.message||'apple_purchase_verification_failed');
          console.error('[api/wallet apple purchase]',code.slice(0,180));
          const status=code.includes('not_configured')||code.includes('root_ca')||code.includes('app_id')?503:code.includes('mismatch')||code.includes('revoked')||code.includes('owned_by_other_user')?409:502;
          return res.status(status).json({error:code});
        }
      }

      return res.status(400).json({error:'platform_not_supported'});
    }
    if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
    const r=await pool.query(`select u.plan,w.purchased_credits as purchased,w.subscription_credits as subscription,w.promo_credits as promo,(w.purchased_credits+w.subscription_credits+w.promo_credits) as credits from users u join wallets w on w.user_id=u.id where u.id=$1`,[userId]);
    if(!r.rowCount) return res.status(404).json({error:'wallet_not_found'});
    return res.status(200).json({userId,...r.rows[0]});
  }catch(error){
    console.error('[api/wallet] failed',String(error).slice(0,500));
    return res.status(500).json({error:'wallet_failed'});
  }
}
