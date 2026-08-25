import type { VercelRequest,VercelResponse } from '@vercel/node';

const products = [
  {id:'veyra_credits_100',title:'Starter',credits:100,type:'consumable',badge:null},
  {id:'veyra_credits_500',title:'Creator',credits:500,type:'consumable',badge:'Popüler'},
  {id:'veyra_credits_1500',title:'Pro Pack',credits:1500,type:'consumable',badge:'En iyi değer'},
] as const;

export default function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
  return res.status(200).json({items:products});
}
