import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import { sessionsConfigured, verifySession } from '../../backend/src/session.js';

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string,string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function signatureOk(data: Buffer, mime: string) {
  if (mime === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mime === 'image/png') {
    const sig = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
    return data.length >= sig.length && sig.every((value,index) => data[index] === value);
  }
  if (mime === 'image/webp') return data.length >= 12 && data.subarray(0,4).toString('ascii') === 'RIFF' && data.subarray(8,12).toString('ascii') === 'WEBP';
  return false;
}

function getBody(req: VercelRequest): Buffer | null {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return Buffer.from(req.body, 'base64'); } catch { return null; }
  }
  return null;
}

function bearer(req: VercelRequest) {
  return String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
}

function authorizedUser(req: VercelRequest, requestedUserId: string) {
  if (sessionsConfigured()) {
    const session = verifySession(bearer(req));
    return session?.userId === requestedUserId;
  }
  const requireAuth = String(process.env.VEYRA_REQUIRE_AUTH ?? 'false').toLowerCase() === 'true';
  return !requireAuth;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(503).json({error:'storage_not_configured'});

  const userId = String(req.headers['x-veyra-user-id'] ?? '').trim();
  if (!userId || userId.length > 200) return res.status(401).json({error:'unauthorized'});
  if (!authorizedUser(req,userId)) return res.status(401).json({error:'unauthorized'});

  const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  const ext = TYPES[mime];
  if (!ext) return res.status(415).json({error:'unsupported_image_type',allowed:Object.keys(TYPES)});

  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_BYTES) return res.status(413).json({error:'image_too_large',maxBytes:MAX_BYTES});
  const data = getBody(req);
  if (!data?.length) return res.status(400).json({error:'empty_image'});
  if (data.length > MAX_BYTES) return res.status(413).json({error:'image_too_large',maxBytes:MAX_BYTES});
  if (!signatureOk(data,mime)) return res.status(415).json({error:'image_signature_mismatch'});

  const owner = crypto.createHash('sha256').update(userId).digest('hex').slice(0,24);
  const pathname = `veyra/users/${owner}/images/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  try {
    const blob = await put(pathname,data,{access:'public',contentType:mime,token,addRandomSuffix:false});
    return res.status(201).json({url:blob.url,contentType:mime,size:data.length});
  } catch (error) {
    console.error('[api/uploads/image] blob upload failed', String(error).slice(0,500));
    return res.status(502).json({error:'image_upload_failed'});
  }
}
