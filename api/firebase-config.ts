import type { VercelRequest,VercelResponse } from '@vercel/node';

function parseJson(value:string|undefined){
  if(!value?.trim()) return {} as Record<string,string>;
  try{return JSON.parse(value) as Record<string,string>}catch{return {} as Record<string,string>}
}

export default function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});

  const webJson=parseJson(process.env.FIREBASE_WEB_CONFIG_JSON || process.env.FIREBASE_CONFIG_JSON);
  const service=parseJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId=String(
    process.env.FIREBASE_WEB_PROJECT_ID || webJson.projectId || webJson.project_id || service.project_id || ''
  ).trim();
  const authDomain=String(
    process.env.FIREBASE_WEB_AUTH_DOMAIN || webJson.authDomain || (projectId?`${projectId}.firebaseapp.com`:'')
  ).trim();
  const config={
    apiKey:String(process.env.FIREBASE_WEB_API_KEY || webJson.apiKey || '').trim(),
    authDomain,
    projectId,
    appId:String(process.env.FIREBASE_WEB_APP_ID || webJson.appId || '').trim(),
    messagingSenderId:String(process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || webJson.messagingSenderId || '').trim(),
    storageBucket:String(process.env.FIREBASE_WEB_STORAGE_BUCKET || webJson.storageBucket || '').trim(),
  };

  // Firebase Auth itself primarily needs apiKey + authDomain. projectId/appId are kept when available.
  const configured=Boolean(config.apiKey && config.authDomain);
  const googleEnabled=configured && process.env.FIREBASE_GOOGLE_ENABLED !== 'false';
  const appleEnabled=configured && process.env.FIREBASE_APPLE_ENABLED === 'true';

  return res.status(200).json({
    configured,
    config:configured?config:null,
    providers:{google:googleEnabled,apple:appleEnabled},
    fields:{
      apiKey:Boolean(config.apiKey),authDomain:Boolean(config.authDomain),projectId:Boolean(config.projectId),
      appId:Boolean(config.appId),messagingSenderId:Boolean(config.messagingSenderId),storageBucket:Boolean(config.storageBucket),
    },
    authHandler:projectId?`https://${projectId}.firebaseapp.com/__/auth/handler`:null,
  });
}
