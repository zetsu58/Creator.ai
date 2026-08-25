# Veyra AI — Production Payment & Social Auth Setup

Production domain: `https://veyra-ai-sigma.vercel.app`
Android package / Apple bundle ID: `ai.veyra.app`

## 1. PayTR web card checkout

Create/approve the Veyra merchant in PayTR. In PayTR Merchant Panel open **Destek & Kurulum > Entegrasyon Bilgileri** and obtain:

- `merchant_id` -> Vercel `PAYTR_MERCHANT_ID`
- `merchant_key` -> Vercel `PAYTR_MERCHANT_KEY`
- `merchant_salt` -> Vercel `PAYTR_MERCHANT_SALT`

Configure the PayTR **Bildirim URL** as exactly:

`https://veyra-ai-sigma.vercel.app/api/paytr/callback`

Vercel production envs:

```text
VEYRA_PUBLIC_BASE_URL=https://veyra-ai-sigma.vercel.app
PAYTR_MERCHANT_ID=...
PAYTR_MERCHANT_KEY=...
PAYTR_MERCHANT_SALT=...
PAYTR_TEST_MODE=1
PAYTR_DEBUG_ON=1
PAYTR_NO_INSTALLMENT=0
PAYTR_MAX_INSTALLMENT=0
VEYRA_WEB_PRICE_100_TRY=...
VEYRA_WEB_PRICE_500_TRY=...
VEYRA_WEB_PRICE_1500_TRY=...
```

Start with test mode. After test transactions and callback credit grants are verified, set `PAYTR_TEST_MODE=0` and `PAYTR_DEBUG_ON=0`.

The browser never receives merchant secrets. Card PAN/CVV is entered inside PayTR hosted iframe. Veyra grants credits only after a signed server callback is verified. Repeated callbacks are idempotent.

## 2. Google sign-in via Firebase

Firebase Console:

1. Create/select the Veyra Firebase project.
2. **Project settings > Your apps > Add app > Web**.
3. Copy the Web SDK config into Vercel production envs:
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_WEB_AUTH_DOMAIN`
   - `FIREBASE_WEB_PROJECT_ID`
   - `FIREBASE_WEB_APP_ID`
   - `FIREBASE_WEB_MESSAGING_SENDER_ID`
   - `FIREBASE_WEB_STORAGE_BUCKET`
4. **Authentication > Sign-in method > Google > Enable**.
5. **Authentication > Settings > Authorized domains**: add `veyra-ai-sigma.vercel.app`.
6. Set `FIREBASE_GOOGLE_ENABLED=true`.
7. Create a Firebase Admin service account and place the complete JSON only in Vercel `FIREBASE_SERVICE_ACCOUNT_JSON`.

Do not add Firebase Admin credentials to Flutter or GitHub.

## 3. Apple sign-in via Firebase

Apple Developer:

1. **Certificates, Identifiers & Profiles > Identifiers**.
2. Enable **Sign in with Apple** on the Veyra App ID (`ai.veyra.app`).
3. Create a **Services ID** for the web sign-in client.
4. Configure Sign in with Apple for that Services ID and associate it with the Veyra primary App ID.
5. Register domain: `veyra-ai-sigma.vercel.app`.
6. Register the Firebase callback/return URL shown by Firebase Apple provider. It normally uses the Firebase Auth handler under the project's `firebaseapp.com` domain.
7. Create a Sign in with Apple private key and note Team ID, Key ID and Services ID.

Firebase Console:

1. **Authentication > Sign-in method > Apple**.
2. Enable Apple and enter the Apple Services ID / Team ID / Key ID / private key values requested by Firebase.
3. Set Vercel `FIREBASE_APPLE_ENABLED=true` after the provider is complete.

## 4. Google Play Billing

Google Play Console one-time products:

- `veyra_credits_100`
- `veyra_credits_500`
- `veyra_credits_1500`

Create/activate each product and define local pricing. Grant an Android Publisher API service account access and place the full JSON only in Vercel `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

## 5. Apple App Store IAP

App Store Connect Consumable products:

- `veyra_credits_100`
- `veyra_credits_500`
- `veyra_credits_1500`

Configure Vercel:

- `APPLE_BUNDLE_ID=ai.veyra.app`
- `APPLE_APP_ID`
- `APPLE_IAP_ISSUER_ID`
- `APPLE_IAP_KEY_ID`
- `APPLE_IAP_PRIVATE_KEY`
- `APPLE_ROOT_CA_B64`

## 6. Final smoke test

1. Create a normal Veyra account (not guest).
2. Open `/pricing`.
3. Start a PayTR test checkout.
4. Complete the hosted payment.
5. Confirm `/payment-result` waits for callback verification.
6. Confirm purchased credits increase once only.
7. Confirm purchase appears in purchase history.
8. Repeat the same callback/token and verify no second credit grant.
9. Test Google login on desktop popup and Android mobile redirect.
10. Test Apple login on Safari/iPhone after Apple provider setup.
