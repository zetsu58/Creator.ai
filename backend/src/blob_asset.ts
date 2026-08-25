const VEYRA_BLOB_PATH_PREFIX = '/veyra/users/';

export function isVeyraBlobImageUrl(value: string) {
  try {
    const url = new URL(value);
    const hostOk = url.hostname === 'blob.vercel-storage.com' || url.hostname.endsWith('.public.blob.vercel-storage.com');
    if (url.protocol !== 'https:' || !hostOk || !url.pathname.startsWith(VEYRA_BLOB_PATH_PREFIX)) return false;
    return /\.(?:jpe?g|png|webp)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function generationInputImage(type: string, references: string[]) {
  if (type !== 'video' || references.length === 0) return null;
  const first = references[0];
  return isVeyraBlobImageUrl(first) ? first : null;
}
