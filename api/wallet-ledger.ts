import type { VercelRequest,VercelResponse } from '@vercel/node';
import { pool } from '../backend/src/db.js';
import { requireUser } from '../backend/src/api_auth.js';

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
  if(!pool) return res.status(503).json({error:'database_not_configured'});
  const requested=String(req.query.userId||'').trim();
  const userId=await requireUser(req,requested||null);
  if(!userId) return res.status(401).json({error:'unauthorized'});
  try{
    const r=await pool.query(`select id,bucket,delta,reason,reference_type as "referenceType",reference_id as "referenceId",created_at as "createdAt" from credit_ledger where user_id=$1 order by created_at desc limit 100`,[userId]);
    return res.status(200).json({items:r.rows});
  }catch(error){
    console.error('[wallet-ledger]',String(error).slice(0,300));
    return res.status(500).json({error:'wallet_ledger_failed'});
  }
}
