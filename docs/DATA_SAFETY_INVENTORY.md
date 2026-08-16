# Veyra AI Data Safety Inventory

Use this inventory to complete Google Play Data Safety and Apple App Privacy only after final production configuration is confirmed.

| Data category | Example | Purpose | Shared with processor/provider? | User deletion |
|---|---|---|---|---|
| Account identifiers | email/auth subject | account/login/support | auth provider when configured | yes |
| User content | prompts | AI generation | AI provider | yes |
| Photos/videos/audio | reference uploads | AI generation/editing | AI provider + object storage | yes |
| Generated content | image/video output | project history/export | object storage | yes |
| Purchase info | product ID, transaction ID, receipt/token | entitlement verification | Google/Apple | accounting/security retention may apply |
| App integrity | Play Integrity verdict | fraud/abuse prevention | Google Play | security retention policy |
| Diagnostics | crash/performance events | reliability | crash provider when configured | aggregate/retention policy |
| Device/network security data | server logs, abuse signals | security/rate limiting | infrastructure providers | retention policy |
| Advertising data | AdMob identifiers/consent state when enabled | ads | Google AdMob | provider policy |

## Required production decisions

- Exact authentication provider.
- Exact AI providers and whether each retains training/service data.
- Object-storage region and retention period.
- Analytics/crash provider and collection defaults.
- AdMob consent/CMP behavior by region.
- Prompt/reference/output default retention period.
- Security log retention period.
- Legal/accounting retention period for purchases.

Do not claim “data is not collected” if the production backend processes prompts, uploaded media, transactions, integrity signals, diagnostics or advertising identifiers.
