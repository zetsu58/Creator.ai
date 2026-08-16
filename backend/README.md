# Veyra AI Backend

Runnable TypeScript/Node API for the Veyra AI mobile and web clients.

## Working now

- `GET /health` service/provider health and capability list
- `GET /v1/legal` production legal/support URL discovery
- wallet and user generation history
- server-side credit quotes
- prompt moderation gate before generation
- credit reservation + generation job creation
- generation status
- user reporting for unsafe/infringing AI outputs
- admin failure endpoint with automatic one-time credit refund
- account deletion API that clears account-linked generation content in the development store
- Copilot planning API
- Brand Kit and batch business APIs
- admin summary, ledger and report queues
- expanded PostgreSQL schema for moderation reports, purchases, integrity events and deletion requests
- Dockerfile + deployment blueprint

## Configured integration contracts (credentials still required)

### Google Play Integrity

`POST /v1/integrity/google-play`

The endpoint exists and refuses to pretend verification succeeded when credentials are absent. Configure `GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON`, then implement the official remote verdict decode/validation adapter before enabling `PLAY_INTEGRITY_REQUIRED=true` in production.

### Google Play Billing verification

`POST /v1/purchases/google/verify`

The API contract exists and requires `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Until the official Play Developer API call and acknowledge/consume workflow are completed with real credentials, the endpoint returns a non-success status rather than granting credits.

### Apple In-App Purchase verification

`POST /v1/purchases/apple/verify`

The API contract exists and requires `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID` and `APPLE_IAP_PRIVATE_KEY`. Until App Store Server API verification is wired with real credentials, it does not grant credits.

## Development vs production storage

The development server currently uses an in-memory store so it can boot without external infrastructure. This is suitable only for UI/API contract testing.

Production must switch to the PostgreSQL schema in `db/schema.sql` before accepting real users, real purchases or persistent credits. Restarting the memory-store server loses test data.

## Local start

```bash
cd backend
cp .env.example .env
npm install
npm run build
npm run dev
```

Health check:

```bash
curl http://localhost:8080/health
```

## Flutter client configuration

```bash
flutter run --dart-define=VEYRA_API_BASE_URL=https://api.example.com
```

Provider API keys, payment credentials, admin tokens, database passwords and signing keys must never be committed or bundled into the APK/IPA.

## P0 production work still requiring external credentials/infrastructure

1. PostgreSQL repository adapter and migrations on the chosen production host.
2. Redis-backed queue/worker or equivalent durable job queue.
3. Production authentication/JWT provider.
4. Real image/video provider adapters and signed webhook validation.
5. Official Google Play purchase verification + acknowledge/consume.
6. Official Apple transaction verification/notifications.
7. Official Play Integrity verdict verification.
8. Object storage with private buckets and signed media URLs.
9. Production rate limits/WAF and distributed abuse controls.
10. Crash/error monitoring, metrics, backups and alerts.
