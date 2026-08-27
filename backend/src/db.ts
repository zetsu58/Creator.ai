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

// Idempotent production bootstrap: every authenticated API can repair missing core tables safely.
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
        role text not null default 'USER',
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
      alter table users add column if not exists role text not null default 'USER';
      alter table users add column if not exists status text not null default 'active';
      alter table users add column if not exists updated_at timestamptz not null default now();
      alter table users add column if not exists deleted_at timestamptz;

      -- Older production schemas constrained role to legacy lowercase values.
      -- Normalize first, then replace that constraint with the RBAC values used by the API.
      alter table users drop constraint if exists users_role_check;
      update users set role=case when upper(coalesce(role,'USER'))='ADMIN' then 'ADMIN' else 'USER' end;
      alter table users alter column role set default 'USER';
      alter table users add constraint users_role_check check (role in ('USER','ADMIN'));

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

      create table if not exists admin_audit_log (
        id uuid primary key default gen_random_uuid(),
        admin_user_id uuid not null references users(id) on delete restrict,
        target_user_id uuid references users(id) on delete set null,
        action text not null,
        metadata jsonb not null default '{}'::jsonb,
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

      create table if not exists purchases (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        platform text not null,
        product_id text not null,
        external_transaction_id text not null,
        purchase_token_hash text,
        status text not null,
        amount_minor bigint,
        currency text,
        credits_granted bigint not null default 0,
        raw_reference text,
        created_at timestamptz not null default now(),
        verified_at timestamptz,
        unique(platform, external_transaction_id)
      );

      create table if not exists api_sessions (
        token_hash text primary key,
        user_id uuid not null references users(id) on delete cascade,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      );

      create table if not exists password_reset_tokens (
        token_hash text primary key,
        user_id uuid not null references users(id) on delete cascade,
        expires_at timestamptz not null,
        used_at timestamptz,
        created_at timestamptz not null default now()
      );

      alter table generation_jobs add column if not exists input_image_url text;
      alter table generation_jobs add column if not exists reservation_breakdown jsonb not null default '{}'::jsonb;
      alter table purchases add column if not exists purchase_token_hash text;
      alter table purchases add column if not exists amount_minor bigint;
      alter table purchases add column if not exists currency text;
      alter table purchases add column if not exists credits_granted bigint not null default 0;
      alter table purchases add column if not exists raw_reference text;
      alter table purchases add column if not exists verified_at timestamptz;

      update users set role='ADMIN',updated_at=now()
      where lower(email)='zambakste@gmail.com' and role is distinct from 'ADMIN';

      create unique index if not exists idx_users_external_auth_unique on users(external_auth_id) where external_auth_id is not null;
      create unique index if not exists idx_users_email_unique on users(lower(email)) where email is not null;
      create index if not exists idx_generation_user_created on generation_jobs(user_id, created_at desc);
      create index if not exists idx_generation_status on generation_jobs(status, created_at);
      create index if not exists idx_credit_ledger_user_created on credit_ledger(user_id, created_at desc);
      create index if not exists idx_api_sessions_user on api_sessions(user_id, expires_at desc);
      create index if not exists idx_password_reset_user on password_reset_tokens(user_id, expires_at desc);
      create index if not exists idx_purchases_user_created on purchases(user_id, created_at desc);
      create index if not exists idx_admin_audit_created on admin_audit_log(created_at desc);
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
