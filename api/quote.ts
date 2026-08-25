import type { VercelRequest,VercelResponse } from '@vercel/node';

type Kind='image'|'video'|'product_ad'|'headshot'|'magic_edit';
type Quality='fast'|'pro'|'cinematic';

function quoteCost(type:Kind,quality:Quality,audio:boolean,draft:boolean,seconds:number){
  if(type==='image'||type==='magic_edit') return quality==='fast'?5:10;
  if(type==='product_ad'||type==='headshot') return quality==='fast'?12:22;
  const per=quality==='fast'?5:quality==='pro'?8:12;
  const normal=Math.max(20,seconds*per+(audio?8:0));
  return draft?Math.max(8,Math.ceil(normal*.35)):normal;
}

export default function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
  const b=req.body&&typeof req.body==='object'?req.body:{};
  const type=String(b.type||'') as Kind,quality=(String(b.quality||'fast') as Quality),seconds=Number(b.seconds||0),audio=Boolean(b.audio),draft=Boolean(b.draft);
  if(!['image','video','product_ad','headshot','magic_edit'].includes(type)||!['fast','pro','cinematic'].includes(quality)||!Number.isFinite(seconds)||seconds<0||seconds>60) return res.status(400).json({error:'invalid_request'});
  return res.status(200).json({credits:quoteCost(type,quality,audio,draft,Math.floor(seconds))});
}
