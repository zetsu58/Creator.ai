import crypto from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { ensureGenerationSchema, pool } from './db.js';

export function bearerToken(req: VercelRequest) {
  return String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function authenticateRequest(req: VercelRequest): Promise<string | null> {
  if (!pool) return null;
  const token = bearerToken(req);
  if (!token || token.length < 32 || token.length > 512) return null;
  await ensureGenerationSchema();
  const hash = hashToken(token);
  const r = await pool.query(
    `select s.user_id as "userId"
       from api_sessions s
       join users u on u.id=s.user_id
      where s.token_hash=$1 and s.expires_at>now() and u.status='active'
      limit 1`,
    [hash],
  );
  return r.rowCount ? String(r.rows[0].userId) : null;
}

export async function requireUser(req: VercelRequest, requestedUserId?: string | null) {
  const userId = await authenticateRequest(req);
  if (!userId) return null;
  if (requestedUserId && userId !== requestedUserId) return null;
  return userId;
}
