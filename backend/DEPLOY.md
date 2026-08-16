# Veyra Cloud deployment

## 1. Deploy the API
Use the repository root `render.yaml` Blueprint (or an equivalent Docker host). The backend Docker context is `backend/` and the health check is `/health`.

Required production environment variables:

- `PORT=8080`
- `VEYRA_ADMIN_TOKEN` (strong random secret)
- `DATABASE_URL` (provided by the managed PostgreSQL service)
- `AI_PROVIDER_PRIMARY=mock` initially; change only after a real provider adapter is verified
- `AI_PROVIDER_FALLBACK=mock` initially

Keep all provider, Google Play, Apple and storage secrets server-side. Never pass them with Flutter `--dart-define`.

## 2. Verify the deployed API

From a machine with Node 22+:

```bash
cd backend
VEYRA_API_BASE_URL=https://YOUR-VEYRA-CLOUD.example npm run smoke
```

Expected checks:

- `/health` returns `ok: true`
- `/v1/store/products` returns credit products
- a user wallet is created/read
- quote returns a positive credit cost
- generation job is accepted
- job can be read back
- reserved credits decrease the wallet

## 3. Connect Android/Web/iOS builds

Create this Codemagic environment variable (Secret):

`VEYRA_API_BASE_URL=https://YOUR-VEYRA-CLOUD.example`

Do not include a trailing slash.

The current Codemagic workflows automatically pass it as:

`--dart-define=VEYRA_API_BASE_URL="$VEYRA_API_BASE_URL"`

After the next APK installation, the home Cloud bar should report online and Credit Center should load products/wallet data.

## 4. Production provider sequence

Keep `mock` until the complete client→Cloud→wallet→job chain passes. Then enable providers one by one:

1. image provider
2. video provider
3. enhance/background provider
4. voice/TTS provider
5. fallback routing

A provider is not considered enabled until timeout, failure, retry and automatic credit refund tests pass.

## 5. Store/payment sequence

Only after Cloud is stable:

- create matching Google Play products (`veyra_credits_250`, `veyra_credits_700`, `veyra_credits_1600`, `veyra_credits_4000`, `veyra_pro_monthly`, `veyra_business_monthly`)
- configure server-side Google Play purchase verification
- test pending, purchased, duplicate token, refund/revoke and restore flows
- repeat with App Store products and App Store Server API

Never grant credits based only on the client purchase callback.

## 6. Release gate

Do not submit the production AAB until all are true:

- Cloud `/health` green
- wallet survives server restart (PostgreSQL persistence enabled)
- generation failure refunds exactly once
- purchase verification is server-side
- production AdMob IDs configured
- AI moderation/report flow works
- account deletion works
- release AAB uses API 36 and production signing
- test/debug URLs and provider secrets are absent from the APK/AAB
