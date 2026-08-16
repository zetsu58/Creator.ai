import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = (process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  console.log('DATABASE_URL not configured; migration skipped (memory mode).');
  process.exit(0);
}

const sqlPath = path.resolve(process.cwd(), 'db/schema.sql');
const sql = await fs.readFile(sqlPath, 'utf8');
const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  await client.query(sql);
  console.log('Veyra database migration completed.');
} finally {
  await client.end();
}
