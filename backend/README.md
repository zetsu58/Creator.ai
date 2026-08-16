# Veyra AI Backend

Runnable TypeScript/Node API for the Veyra AI mobile and web clients.

## Current working foundation

- `GET /health` service/provider health
- `GET /v1/users/:userId/wallet` starter wallet
- `POST /v1/quote` server-side credit pricing
- `POST /v1/generations` credit reservation + generation job creation
- `GET /v1/generations/:id` job status
- admin-protected mock completion/refund endpoints
- admin summary and ledger endpoints
- PostgreSQL production schema for users, wallets, ledger, jobs, purchases, provider events and audit logs
- Dockerfile + Render blueprint

The development core currently uses an in-memory store so it can boot without external services. Production must use the PostgreSQL schema in `db/schema.sql`; Redis/queue workers are the next persistence step.

## Local start

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:8080/health
```

## Client configuration

Flutter reads the backend URL from `VEYRA_API_BASE_URL`:

```bash
flutter run --dart-define=VEYRA_API_BASE_URL=https://api.example.com
```

Never commit provider API keys, payment secrets, admin tokens, database passwords or signing credentials. They belong in the hosting platform secret store only.

## Production roadmap

1. PostgreSQL repository layer + migrations
2. Redis-backed generation queue and worker
3. authentication/JWT validation
4. provider adapters (video/image) and signed webhooks
5. Google Play / Apple purchase verification and web payment provider
6. object storage + signed media URLs
7. rate limiting, abuse controls, moderation and audit logs
8. metrics, tracing, backups and alerting
