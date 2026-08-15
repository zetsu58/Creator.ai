# CreatorAI Backend

Planned secure services:

- auth: user sessions and admin roles
- wallet: credit ledger, holds, refunds, purchase grants
- orchestrator: prompt planning and specialist-role routing
- generations: image/video jobs, provider routing, retries, moderation and quality checks
- payments: Google Play, Apple IAP and web payment verification
- admin-api: metrics, users, credits, providers, moderation and system health

Provider API keys, payment secrets and admin credentials must only exist in server-side secrets. They must never be committed to this repository or bundled into the mobile APK.
