import type { VercelRequest, VercelResponse } from '@vercel/node';
import { databaseHealth, ensureGenerationSchema, pool } from '../backend/src/db.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  let schema = false;
  let database = false;
  if (pool) {
    try {
      await ensureGenerationSchema();
      schema = true;
      const health = await databaseHealth();
      database = health.ok === true;
    } catch (error) {
      console.error('[api/health] database bootstrap failed', String(error).slice(0,500));
    }
  }
  return res.status(database || !process.env.DATABASE_URL ? 200 : 503).json({
    ok: database || !process.env.DATABASE_URL,
    app: 'veyra-ai',
    version: 'image-to-video-pipeline',
    services: {
      runway: Boolean(process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET),
      database,
      schema,
      storage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    },
  });
}
