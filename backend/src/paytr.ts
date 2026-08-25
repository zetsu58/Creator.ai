import crypto from 'node:crypto';

export const WEB_PRODUCTS = {
  veyra_credits_100: {credits:100,title:'Starter 100 Kredi',priceTry:Number(process.env.VEYRA_WEB_PRICE_100_TRY||0)},
  veyra_credits_500: {credits:500,title:'Creator 500 Kredi',priceTry:Number(process.env.VEYRA_WEB_PRICE_500_TRY||0)},
  veyra_credits_1500: {credits:1500,title:'Pro 1500 Kredi',priceTry:Number(process.env.VEYRA_WEB_PRICE_1500_TRY||0)},
} as const;

export function paytrConfigured(){
  return Boolean(process.env.PAYTR_MERCHANT_ID&&process.env.PAYTR_MERCHANT_KEY&&process.env.PAYTR_MERCHANT_SALT);
}

export function publicBase(){return (process.env.VEYRA_PUBLIC_BASE_URL||'https://veyra-ai-sigma.vercel.app').replace(/\/$/,'')}

export function clientIp(headers:Record<string,unknown>){
  const raw=String(headers['x-forwarded-for']||headers['x-real-ip']||'');
  return (raw.split(',')[0]||'').trim().slice(0,39)||'127.0.0.1';
}

export function createMerchantOid(){return `V${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(8).toString('hex').toUpperCase()}`.slice(0,64)}

export function createPaytrToken(args:{userIp:string;merchantOid:string;email:string;paymentAmount:string;userBasket:string;noInstallment:string;maxInstallment:string;currency:string;testMode:string}){
  const merchantId=String(process.env.PAYTR_MERCHANT_ID||'');
  const key=String(process.env.PAYTR_MERCHANT_KEY||'');
  const salt=String(process.env.PAYTR_MERCHANT_SALT||'');
  const hashStr=`${merchantId}${args.userIp}${args.merchantOid}${args.email}${args.paymentAmount}${args.userBasket}${args.noInstallment}${args.maxInstallment}${args.currency}${args.testMode}${salt}`;
  return crypto.createHmac('sha256',key).update(hashStr).digest('base64');
}

export function verifyCallbackHash(merchantOid:string,status:string,totalAmount:string,received:string){
  const key=String(process.env.PAYTR_MERCHANT_KEY||'');
  const salt=String(process.env.PAYTR_MERCHANT_SALT||'');
  const expected=crypto.createHmac('sha256',key).update(`${merchantOid}${salt}${status}${totalAmount}`).digest('base64');
  const a=Buffer.from(expected),b=Buffer.from(String(received||''));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

export async function requestIframeToken(input:{merchantOid:string;email:string;fullName:string;address:string;phone:string;productId:keyof typeof WEB_PRODUCTS;userIp:string}){
  if(!paytrConfigured())throw new Error('paytr_not_configured');
  const product=WEB_PRODUCTS[input.productId];
  if(!product||!Number.isFinite(product.priceTry)||product.priceTry<=0)throw new Error('web_price_not_configured');
  const merchantId=String(process.env.PAYTR_MERCHANT_ID);
  const paymentAmount=String(Math.round(product.priceTry*100));
  const userBasket=Buffer.from(JSON.stringify([[product.title,product.priceTry.toFixed(2),1]])).toString('base64');
  const noInstallment=String(process.env.PAYTR_NO_INSTALLMENT||'0');
  const maxInstallment=String(process.env.PAYTR_MAX_INSTALLMENT||'0');
  const currency='TL';
  const testMode=String(process.env.PAYTR_TEST_MODE||'1');
  const debugOn=String(process.env.PAYTR_DEBUG_ON||'1');
  const token=createPaytrToken({userIp:input.userIp,merchantOid:input.merchantOid,email:input.email,paymentAmount,userBasket,noInstallment,maxInstallment,currency,testMode});
  const form=new URLSearchParams({
    merchant_id:merchantId,user_ip:input.userIp,merchant_oid:input.merchantOid,email:input.email,payment_amount:paymentAmount,paytr_token:token,user_basket:userBasket,
    debug_on:debugOn,no_installment:noInstallment,max_installment:maxInstallment,user_name:input.fullName.slice(0,60),user_address:input.address.slice(0,400),user_phone:input.phone.slice(0,20),
    merchant_ok_url:`${publicBase()}/payment-result?status=success&oid=${encodeURIComponent(input.merchantOid)}`,
    merchant_fail_url:`${publicBase()}/payment-result?status=failed&oid=${encodeURIComponent(input.merchantOid)}`,
    timeout_limit:'30',currency,test_mode:testMode,lang:'tr',iframe_v2:'1',iframe_v2_dark:'0'
  });
  const r=await fetch('https://www.paytr.com/odeme/api/get-token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form.toString()});
  const body:any=await r.json().catch(()=>({}));
  if(!r.ok||body?.status!=='success'||!body?.token)throw new Error(`paytr_token_failed:${String(body?.reason||r.status).slice(0,180)}`);
  return {token:String(body.token),paymentAmount:Number(paymentAmount),currency:'TRY',credits:product.credits,title:product.title,priceTry:product.priceTry};
}
