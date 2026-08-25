import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    ok: true,
    app: 'veyra-ai',
    version: 'image-to-video-pipeline',
    services: {
      runway: Boolean(process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET),
      database: Boolean(process.env.DATABASE_URL),
      storage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    },
  });
}
