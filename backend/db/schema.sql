create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  external_auth_id text unique,
  email text,
  plan text not null default 'free' check (plan in ('free','pro','business')),
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists wallets (
  user_id uuid primary key references users(id) on delete cascade,
  purchased_credits bigint not null default 0 check (purchased_credits >= 0),
  subscription_credits bigint not null default 0 check (subscription_credits >= 0),
  promo_credits bigint not null default 0 check (promo_credits >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  bucket text not null check (bucket in ('purchased','subscription','promo')),
  delta bigint not null,
  reason text not null,
  reference_type text,
  reference_id text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_credit_ledger_user_created on credit_ledger(user_id, created_at desc);

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('image','video','product_ad','headshot','magic_edit')),
  prompt text not null,
  prompt_moderation jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','refunded','cancelled')),
  quality text not null default 'fast',
  aspect_ratio text,
  duration_seconds integer,
  audio boolean not null default false,
  provider text,
  provider_job_id text,
  credits_reserved bigint not null default 0,
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
create index if not exists idx_generation_user_created on generation_jobs(user_id, created_at desc);
create index if not exists idx_generation_status on generation_jobs(status, created_at);

create table if not exists generation_reports (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid not null references generation_jobs(id) on delete cascade,
  reporter_user_id uuid references users(id) on delete set null,
  reason text not null check (reason in ('unsafe','sexual','violent','hate','copyright','identity','spam','other')),
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_generation_reports_status on generation_reports(status, created_at desc);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  platform text not null check (platform in ('google_play','apple','web')),
  product_id text not null,
  external_transaction_id text not null,
  purchase_token_hash text,
  status text not null check (status in ('pending','verified','refunded','revoked','failed')),
  amount_minor bigint,
  currency text,
  credits_granted bigint not null default 0,
  raw_reference text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique(platform, external_transaction_id)
);

create table if not exists integrity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  platform text not null default 'google_play',
  verdict text,
  app_integrity text,
  device_integrity text,
  licensing_verdict text,
  request_hash text,
  created_at timestamptz not null default now()
);
create index if not exists idx_integrity_user_created on integrity_events(user_id, created_at desc);

create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  external_auth_id text,
  status text not null default 'requested' check (status in ('requested','processing','completed','rejected')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text,
  event_type text not null,
  generation_job_id uuid references generation_jobs(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_subject text not null,
  action text not null,
  target_type text,
  target_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_audit_created on admin_audit_log(created_at desc);
