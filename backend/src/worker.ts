import 'dotenv/config';
import { databaseConfigured, databaseHealth } from './db.js';
import { startGenerationWorker } from './generation_worker.js';

async function main() {
  if (!databaseConfigured) {
    console.error('[worker] DATABASE_URL is required');
    process.exit(1);
  }

  const health = await databaseHealth();
  console.log('[worker] database', health);
  console.log('[worker] starting durable generation worker');
  startGenerationWorker();

  const shutdown = (signal: string) => {
    console.log(`[worker] ${signal} received, shutting down`);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep the process alive. The worker owns its own polling loop/timers.
  setInterval(() => console.log('[worker] heartbeat'), 60_000).unref();
}

main().catch((error) => {
  console.error('[worker] fatal', error);
  process.exit(1);
});
