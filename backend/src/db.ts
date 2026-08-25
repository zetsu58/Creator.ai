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

let schemaPromise: Promise<void> | null = null;

export async function ensureGenerationSchema() {
  if (!pool) throw new Error('database_not_configured');
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await pool.query(`
      create extension if not exists pgcrypto;

      create table if not exists users (
        id uuid primary key default gen_random_uuid(),
        external_auth_id text unique,
        email text,
        display_name text,
        password_salt text,
        password_hash text,
        plan text not null default 'free',
        status text not null default 'active',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        deleted_at timestamptz
      );

      alter table users add column if not exists external_auth_id text;
      alter table users add column if not exists email text;
      alter table users add column if not exists display_name text;
      alter table users add column if not exists password_salt text;
      alter table users add column if not exists password_hash text;
      alter table users add column if not exists plan text not null default 'free';
      alter table users add column if not exists status text not null default 'active';
      alter table users add column if not exists updated_at timestamptz not null default now();
      alter table users add column if not exists deleted_at timestamptz;

      create table if not exists wallets (
        user_id uuid primary key references users(id) on delete cascade,
        purchased_credits bigint not null default 0,
        subscription_credits bigint not null default 0,
        promo_credits bigint not null default 0,
        updated_at timestamptz not null default now()
      );

      create table if not exists credit_ledger (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        bucket text not null,
        delta bigint not null,
        reason text not null,
        reference_type text,
        reference_id text,
        idempotency_key text unique,
        created_at timestamptz not null default now()
      );

      create table if not exists generation_jobs (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        kind text not null,
        prompt text not null,
        prompt_moderation jsonb not null default '{}'::jsonb,
        status text not null default 'queued',
        quality text not null default 'fast',
        aspect_ratio text,
        duration_seconds integer,
        audio boolean not null default false,
        input_image_url text,
        provider text,
        provider_job_id text,
        credits_reserved bigint not null default 0,
        reservation_breakdown jsonb not null default '{}'::jsonb,
        provider_cost_minor bigint,
        provider_currency text,
        output_url text,
        failure_code text,
        failure_message text,
        refunded_at timestamptz,
        created_at timestamptz not null default now(),
        started_at timestamptz,
        completed_at timestamptz
      );

      create table if not exists api_sessions (
        token_hash text primary key,
        user_id uuid not null references users(id) on delete cascade,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      );

      alter table generation_jobs add column if not exists input_image_url text;
      alter table generation_jobs add column if not exists reservation_breakdown jsonb not null default '{}'::jsonb;
      create unique index if not exists idx_users_external_auth_unique on users(external_auth_id) where external_auth_id is not null;
      create unique index if not exists idx_users_email_unique on users(lower(email)) where email is not null;
      create index if not exists idx_generation_user_created on generation_jobs(user_id, created_at desc);
      create index if not exists idx_generation_status on generation_jobs(status, created_at);
      create index if not exists idx_credit_ledger_user_created on credit_ledger(user_id, created_at desc);
      create index if not exists idx_api_sessions_user on api_sessions(user_id, expires_at desc);
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

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
