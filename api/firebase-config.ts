import type { VercelRequest,VercelResponse } from '@vercel/node';

export default function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
  const config={
    apiKey:process.env.FIREBASE_WEB_API_KEY||'',
    authDomain:process.env.FIREBASE_WEB_AUTH_DOMAIN||'',
    projectId:process.env.FIREBASE_WEB_PROJECT_ID||'',
    appId:process.env.FIREBASE_WEB_APP_ID||'',
    messagingSenderId:process.env.FIREBASE_WEB_MESSAGING_SENDER_ID||'',
  };
  const configured=Boolean(config.apiKey&&config.authDomain&&config.projectId&&config.appId);
  return res.status(200).json({configured,config:configured?config:null,providers:{google:configured,apple:configured}});
}
