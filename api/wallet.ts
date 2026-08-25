import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleAuth } from 'google-auth-library';
import { AppStoreServerAPIClient, Environment, SignedDataVerifier } from '@apple/app-store-server-library';
import { pool } from '../backend/src/db.js';
import { requireUser } from '../backend/src/api_auth.js';
import { WEB_PRODUCTS, clientIp, createMerchantOid, paytrConfigured, requestIframeToken, verifyCallbackHash } from '../backend/src/paytr.js';

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
function parseBody(req:VercelRequest):Record<string,any>{
  if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body)) return req.body as Record<string,any>;
  if(typeof req.body==='string') return Object.fromEntries(new URLSearchParams(req.body));
  return {};
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
  catch(prodError){try{verified=await verifyAppleInEnvironment(transactionId,Environment.SANDBOX);}catch{throw prodError;}}
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

async function paytrCallback(req:VercelRequest,res:VercelResponse){
  if(req.method!=='POST') return res.status(405).send('METHOD_NOT_ALLOWED');
  if(!pool||!paytrConfigured()) return res.status(503).send('NOT_CONFIGURED');
  const b=parseBody(req),merchantOid=String(b.merchant_oid||''),status=String(b.status||''),totalAmount=String(b.total_amount||''),hash=String(b.hash||'');
  if(!merchantOid||!verifyCallbackHash(merchantOid,status,totalAmount,hash)) return res.status(400).send('BAD_HASH');
  const client=await pool.connect();
  try{
    await client.query('begin');
    const found=await client.query(`select id,user_id,product_id,status,amount_minor from purchases where platform='web' and external_transaction_id=$1 for update`,[merchantOid]);
    if(!found.rowCount){await client.query('rollback');return res.status(200).send('OK');}
    const p=found.rows[0];
    if(p.status==='verified'){await client.query('rollback');return res.status(200).send('OK');}
    if(status!=='success'){
      await client.query(`update purchases set status='failed',raw_reference=$2 where id=$1`,[p.id,String(b.failed_reason_msg||'payment_failed').slice(0,500)]);
      await client.query('commit');return res.status(200).send('OK');
    }
    if(Number(totalAmount)!==Number(p.amount_minor)) throw new Error('paytr_amount_mismatch');
    const credits=CREDITS[String(p.product_id)]||0;if(!credits)throw new Error('invalid_product');
    await client.query(`update purchases set status='verified',credits_granted=$2,verified_at=now(),raw_reference=$3 where id=$1`,[p.id,credits,`paytr:${String(b.payment_type||'card')}:${String(b.currency||'TL')}`]);
    await client.query(`update wallets set purchased_credits=purchased_credits+$2,updated_at=now() where user_id=$1`,[p.user_id,credits]);
    await client.query(`insert into credit_ledger(user_id,bucket,delta,reason,reference_type,reference_id,idempotency_key) values($1,'purchased',$2,'paytr_card_purchase','purchase',$3,$4) on conflict(idempotency_key) do nothing`,[p.user_id,credits,String(p.id),`paytr:${merchantOid}`]);
    await client.query('commit');return res.status(200).send('OK');
  }catch(e){await client.query('rollback');console.error('[api/wallet paytr callback]',String(e).slice(0,500));return res.status(500).send('ERROR');}finally{client.release();}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action=String(req.query.action??'wallet');
  if(action==='paytr_callback') return paytrCallback(req,res);
  if(action==='products'){
    if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
    const webConfigured=paytrConfigured();
    return res.status(200).json({items:PRODUCTS.map(p=>({...p,webPriceTry:Number((WEB_PRODUCTS as any)[p.id]?.priceTry||0),webEnabled:webConfigured&&Number((WEB_PRODUCTS as any)[p.id]?.priceTry||0)>0})),webCheckoutConfigured:webConfigured});
  }
  if(action==='quote'){
    if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
    const b=parseBody(req),type=String(b.type||''),quality=String(b.quality||'fast'),seconds=Number(b.seconds||0),audio=Boolean(b.audio),draft=Boolean(b.draft);
    if(!['image','video','product_ad','headshot','magic_edit'].includes(type)||!['fast','pro','cinematic'].includes(quality)||!Number.isFinite(seconds)||seconds<0||seconds>60) return res.status(400).json({error:'invalid_request'});
    return res.status(200).json({credits:quoteCost(type,quality,audio,draft,Math.floor(seconds))});
  }
  if(!pool) return res.status(503).json({error:'database_not_configured'});
  const body=parseBody(req);
  const requested=String((req.query.userId??body.userId)||'').trim();
  const userId=await requireUser(req,requested||null);
  if(!userId) return res.status(401).json({error:'unauthorized'});
  try{
    if(action==='web_checkout'){
      if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
      if(!paytrConfigured()) return res.status(503).json({error:'paytr_not_configured'});
      const productId=String(body.productId||'') as keyof typeof WEB_PRODUCTS;
      const product=(WEB_PRODUCTS as any)[productId];
      const phone=String(body.phone||'').trim(),address=String(body.address||'').trim(),fullName=String(body.fullName||'').trim();
      if(!product||!product.priceTry||phone.replace(/\D/g,'').length<10||address.length<10||fullName.length<2) return res.status(400).json({error:'invalid_checkout_details'});
      const u=await pool.query(`select email,display_name,external_auth_id from users where id=$1 and status='active'`,[userId]);
      if(!u.rowCount)return res.status(404).json({error:'user_not_found'});
      const email=String(u.rows[0].email||'');
      if(!email||email.endsWith('@anonymous.veyra.local')||String(u.rows[0].external_auth_id||'').startsWith('device:')) return res.status(409).json({error:'registered_account_required'});
      const merchantOid=createMerchantOid();
      const initialized=await requestIframeToken({merchantOid,email,fullName,address,phone,productId,userIp:clientIp(req.headers as any)});
      await pool.query(`insert into purchases(user_id,platform,product_id,external_transaction_id,status,amount_minor,currency,credits_granted,raw_reference) values($1,'web',$2,$3,'pending',$4,'TRY',0,$5)`,[userId,productId,merchantOid,initialized.paymentAmount,'paytr_pending']);
      return res.status(201).json({ok:true,merchantOid,token:initialized.token,title:initialized.title,credits:initialized.credits,priceTry:initialized.priceTry,currency:'TRY',checkoutPath:`/checkout?oid=${encodeURIComponent(merchantOid)}`});
    }
    if(action==='web_status'){
      if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
      const merchantOid=String(req.query.merchantOid||'');
      const r=await pool.query(`select status,credits_granted as "creditsGranted",raw_reference as message from purchases where platform='web' and external_transaction_id=$1 and user_id=$2`,[merchantOid,userId]);
      if(!r.rowCount)return res.status(404).json({error:'payment_not_found'});
      const w=await pool.query(`select purchased_credits+subscription_credits+promo_credits as credits from wallets where user_id=$1`,[userId]);
      return res.status(200).json({...r.rows[0],credits:Number(w.rows[0]?.credits||0)});
    }
    if(action==='ledger'){
      if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
      const r=await pool.query(`select id,bucket,delta,reason,reference_type as "referenceType",reference_id as "referenceId",created_at as "createdAt" from credit_ledger where user_id=$1 order by created_at desc limit 100`,[userId]);
      return res.status(200).json({items:r.rows});
    }
    if(action==='purchases'){
      if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
      const r=await pool.query(`select id,platform,product_id as "productId",external_transaction_id as "transactionId",status,amount_minor as "amountMinor",currency,credits_granted as "creditsGranted",created_at as "createdAt",verified_at as "verifiedAt" from purchases where user_id=$1 order by created_at desc limit 100`,[userId]);
      return res.status(200).json({items:r.rows});
    }
    if(action==='verify_purchase'){
      if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
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
        }catch(error:any){const code=String(error?.message||'purchase_verification_failed');console.error('[api/wallet google purchase]',code.slice(0,180));const status=code.includes('not_configured')?503:code.includes('not_completed')||code.includes('mismatch')||code.includes('owned_by_other_user')?409:502;return res.status(status).json({error:code});}
      }
      if(platform==='apple'){
        if(!suppliedTransactionId||suppliedTransactionId.length<4) return res.status(400).json({error:'apple_transaction_id_required'});
        try{
          const verified=await verifyApple(productId,suppliedTransactionId),tokenRef=purchaseToken||verified.signed;
          const result=await grantPurchaseCredits({userId,platform:'apple',productId,transactionId:suppliedTransactionId,tokenHashValue:tokenHash(tokenRef),credits,rawReference:`${String(verified.decoded?.environment||'')}|${suppliedTransactionId}`});
          return res.status(200).json({ok:true,...result});
        }catch(error:any){const code=String(error?.message||'apple_purchase_verification_failed');console.error('[api/wallet apple purchase]',code.slice(0,180));const status=code.includes('not_configured')||code.includes('root_ca')||code.includes('app_id')?503:code.includes('mismatch')||code.includes('revoked')||code.includes('owned_by_other_user')?409:502;return res.status(status).json({error:code});}
      }
      return res.status(400).json({error:'platform_not_supported'});
    }
    if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
    const r=await pool.query(`select u.plan,w.purchased_credits as purchased,w.subscription_credits as subscription,w.promo_credits as promo,(w.purchased_credits+w.subscription_credits+w.promo_credits) as credits from users u join wallets w on w.user_id=u.id where u.id=$1`,[userId]);
    if(!r.rowCount) return res.status(404).json({error:'wallet_not_found'});
    return res.status(200).json({userId,...r.rows[0]});
  }catch(error){console.error('[api/wallet] failed',String(error).slice(0,500));return res.status(500).json({error:'wallet_failed'});}
}
