# CreatorAI Payments Architecture

_Last reviewed: 2026-08-15_

## Goal

CreatorAI sells digital AI credits and subscriptions. The payment channel depends on where the purchase happens.

## Mobile storefront rules

### Android / Google Play

Digital credits and subscriptions sold inside the Google Play-distributed Android app use Google Play Billing.

Product IDs:

- `creatorai_credits_100` — consumable credit pack
- `creatorai_credits_300` — consumable credit pack
- `creatorai_credits_1000` — consumable credit pack
- `creatorai_plus_monthly` — subscription
- `creatorai_pro_monthly` — subscription
- `creatorai_business_monthly` — subscription

Purchase flow:

1. App queries Google Play for localized products/prices.
2. Customer confirms in the native Google Play purchase sheet.
3. App sends purchase token + product ID + user ID to CreatorAI Backend.
4. Backend verifies the purchase with Google.
5. Backend creates an idempotent payment transaction record.
6. Credits/plan are granted in one database transaction.
7. Backend/app acknowledges the purchase; consumable credit packs are consumed only after successful entitlement delivery.
8. Refunds, revocations and subscription state changes update entitlements server-side.

Never grant credits only from a client-side success callback.

### iOS / App Store

Digital credits and subscriptions sold inside the App Store-distributed iOS app use Apple In-App Purchase / StoreKit.

The same logical product IDs should be created in App Store Connect where possible.

Purchase flow:

1. App queries StoreKit for localized products/prices.
2. Customer confirms with Apple's native purchase UI.
3. App submits transaction data to CreatorAI Backend.
4. Backend validates the transaction and transaction identity.
5. Backend creates an idempotent payment record.
6. Credits/plan are granted once.
7. Server notifications keep refunds, revocations and subscription changes synchronized.

Consumable credits do not expire merely because they were purchased earlier. Credit expiry, if ever introduced for promotional credits, must be kept separate from purchased-credit balances.

## Web credit-card checkout (Türkiye)

CreatorAI web checkout uses a Turkish merchant payment provider. Initial target: iyzico Checkout Form.

Web checkout is a separate sales surface and must not be used as a hidden workaround for mobile-store billing policies. Whether a mobile app may link to or promote an external checkout depends on the storefront/region and current store rules.

Recommended iyzico flow:

1. Logged-in customer selects a web package.
2. Browser calls `POST /v1/web-payments/checkout` on CreatorAI Backend.
3. Backend maps the package to a server-owned amount and creates an iyzico Checkout Form session.
4. Customer enters card details in iyzico's hosted form; CreatorAI servers do not receive raw PAN/CVV.
5. iyzico calls the HTTPS callback/webhook endpoint.
6. Backend retrieves/verifies payment status server-to-server.
7. Backend inserts an idempotent payment transaction.
8. Credits are granted only after verified `SUCCESS` status.
9. Customer sees a simple success screen and refreshed credit balance.

Do not accept a price, credit amount, plan, user identity or success state directly from browser data without server-side validation.

## Wallet / ledger model

Keep separate balances:

- `purchased_credits`
- `subscription_credits`
- `promo_credits`
- `rewarded_ad_credits`

Spending order can be configured server-side. Suggested order: promotional/reward credits first if they can expire, then subscription credits, then purchased credits.

Every movement is append-only in `credit_ledger`:

- transaction ID
- user ID
- source (`google_play`, `apple_iap`, `iyzico_web`, `rewarded_ad`, `admin_adjustment`, `generation_spend`, `refund`)
- source transaction ID
- delta credits
- balance after
- timestamp
- actor/admin ID if applicable
- reason

A unique constraint on `(source, source_transaction_id)` prevents duplicate credit grants when callbacks are retried.

## Admin panel

Payment dashboard should expose:

- Gross sales by channel
- Net proceeds estimate
- Refunds / chargebacks
- Purchased credits vs spent credits
- Subscription MRR / churn
- Store transaction lookup
- Web-card transaction lookup
- Payout status (manual import/API where permitted)
- Reconciliation differences
- Admin credit adjustments with mandatory reason
- Immutable audit trail

Critical actions require Owner/Finance Admin permission and recent MFA.

## Payout path

### Google Play

Customer pays Google Play. Google deducts applicable fees/taxes/adjustments and pays eligible merchant proceeds to the bank account configured in the Google payments profile according to its payout schedule.

### Apple

Customer pays Apple. Apple calculates proceeds after applicable taxes/commission and transfers eligible proceeds to the primary bank account configured in App Store Connect after the Paid Apps Agreement, tax and banking setup are complete.

### iyzico web checkout

Customer pays through iyzico. Settlement is paid to the merchant bank account/IBAN according to the merchant agreement, risk/blockage and payout schedule. Reconcile iyzico transaction reports against CreatorAI's payment ledger.

## Required accounts before LIVE mode

- Google Play Console developer/merchant payments profile
- Google Play products + subscriptions
- Apple Developer Program account
- App Store Connect Paid Apps Agreement
- Apple banking + tax forms
- App Store Connect IAP products + subscriptions
- iyzico merchant account approved for live payments
- Company/business banking and accounting/tax setup appropriate to the legal entity

## Secrets

Keep these only in backend secret storage, never GitHub source or Flutter assets:

- iyzico API key / secret
- Apple server API credentials/keys
- Google service-account credentials
- webhook signing secrets
- admin JWT/session signing keys

Use sandbox/test credentials until end-to-end purchase verification and refund tests pass.
