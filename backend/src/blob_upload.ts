import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { put } from '@vercel/blob';
import { verifySession } from './session.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const allowed: Record<string,string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function bearer(req: Request) {
  return req.header('authorization')?.replace(/^Bearer\s+/i,'') ?? '';
}

function signatureMatches(bytes: Buffer, mime: string) {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP';
  return false;
}

export function isVeyraBlobUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && (u.hostname === 'blob.vercel-storage.com' || u.hostname.endsWith('.public.blob.vercel-storage.com')) && u.pathname.startsWith('/veyra/users/');
  } catch { return false; }
}

export async function uploadImage(req: Request, res: Response) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(503).json({error:'blob_not_configured'});

  const session = verifySession(bearer(req));
  const headerUserId = (req.header('x-veyra-user-id') ?? '').trim();
  const userId = session?.userId ?? headerUserId;
  if (!userId) return res.status(401).json({error:'unauthorized'});
  if (session && headerUserId && session.userId !== headerUserId) return res.status(403).json({error:'user_mismatch'});

  const mime = (req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = allowed[mime];
  if (!ext) return res.status(415).json({error:'unsupported_image_type',allowed:Object.keys(allowed)});

  const length = Number(req.header('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) return res.status(413).json({error:'image_too_large',maxBytes:MAX_IMAGE_BYTES});
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({error:'empty_image'});
  if (req.body.length > MAX_IMAGE_BYTES) return res.status(413).json({error:'image_too_large',maxBytes:MAX_IMAGE_BYTES});
  if (!signatureMatches(req.body, mime)) return res.status(415).json({error:'image_signature_mismatch'});

  const safeUser = crypto.createHash('sha256').update(userId).digest('hex').slice(0,24);
  const pathname = `veyra/users/${safeUser}/images/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  try {
    const blob = await put(pathname, req.body, { access:'public', contentType:mime, token, addRandomSuffix:false });
    return res.status(201).json({url:blob.url,contentType:mime,size:req.body.length});
  } catch (e) {
    console.error('[blob-upload] failed', String(e).slice(0,500));
    return res.status(502).json({error:'image_upload_failed'});
  }
}

export const imageUploadLimit = MAX_IMAGE_BYTES;
