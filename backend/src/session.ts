import crypto from 'node:crypto';

const secret = () => process.env.VEYRA_SESSION_SECRET?.trim() || '';

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

export function sessionsConfigured() {
  return secret().length >= 32;
}

export function issueSession(userId: string, ttlSeconds = 60 * 60 * 24 * 30) {
  if (!sessionsConfigured()) throw new Error('session_secret_not_configured');
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySession(token: string): { userId: string } | null {
  if (!sessionsConfigured()) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', secret()).update(encoded).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { sub?: string; exp?: number };
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
