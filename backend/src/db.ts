import pg from 'pg';

const { Pool } = pg;

export const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
export const databaseConfigured = databaseUrl.length > 0;

export const pool = databaseConfigured
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    })
  : null;

export async function databaseHealth() {
  if (!pool) return { configured: false, ok: false };
  try {
    const result = await pool.query('select now() as now');
    return { configured: true, ok: true, now: result.rows[0]?.now ?? null };
  } catch (error) {
    return { configured: true, ok: false, error: String(error) };
  }
}

export async function closeDatabase() {
  if (pool) await pool.end();
}
