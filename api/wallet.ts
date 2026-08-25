import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool } from '../backend/src/db.js';
import { requireUser } from '../backend/src/api_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({error:'method_not_allowed'});
  if (!pool) return res.status(503).json({error:'database_not_configured'});
  const requested = String(req.query.userId ?? '').trim();
  const userId = await requireUser(req, requested || null);
  if (!userId) return res.status(401).json({error:'unauthorized'});
  try {
    const r = await pool.query(
      `select u.plan,w.purchased_credits as purchased,w.subscription_credits as subscription,
              w.promo_credits as promo,
              (w.purchased_credits+w.subscription_credits+w.promo_credits) as credits
         from users u join wallets w on w.user_id=u.id where u.id=$1`,
      [userId],
    );
    if (!r.rowCount) return res.status(404).json({error:'wallet_not_found'});
    return res.status(200).json({userId,...r.rows[0]});
  } catch (error) {
    console.error('[api/wallet] failed',String(error).slice(0,500));
    return res.status(500).json({error:'wallet_failed'});
  }
}
