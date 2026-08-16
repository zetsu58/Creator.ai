# Veyra AI Store Release Checklist

## Android / Google Play

- [x] Package target planned as `ai.veyra.app`
- [x] minSdk 24
- [x] compileSdk 36
- [x] targetSdk 36
- [x] AdMob test App ID fallback in non-production build
- [x] AI output report endpoint
- [x] Prompt moderation gate
- [x] Account deletion API
- [x] Automatic generation failure refund path
- [x] Google purchase verification API contract
- [x] Play Integrity API contract
- [ ] Real Google Play service-account JSON configured as secret
- [ ] Real Play Integrity service account configured
- [ ] Real AdMob Android App ID and ad units configured
- [ ] Play App Signing / upload key configured
- [ ] Production AAB signed with store upload key
- [ ] Play Console app created with package `ai.veyra.app`
- [ ] Data Safety completed from final production behavior
- [ ] Content rating completed
- [ ] Ads declaration completed
- [ ] App access/reviewer credentials completed if login is required
- [ ] Privacy Policy public HTTPS URL configured
- [ ] Account-deletion public HTTPS URL configured
- [ ] Closed testing requirement checked for this developer account
- [ ] Pre-launch report / device matrix reviewed
- [ ] Android Vitals monitoring enabled after release

## iOS / App Store

- [x] iOS simulator build workflow exists
- [x] Apple purchase verification API contract
- [x] Privacy/Terms drafts exist
- [x] AI report/moderation architecture exists
- [ ] Apple Developer Team connected
- [ ] Bundle identifier finalized
- [ ] Distribution certificate and provisioning configured
- [ ] Real iOS AdMob App ID configured
- [ ] App Store Connect record created
- [ ] IAP products/subscriptions created
- [ ] App Privacy responses completed from production behavior
- [ ] Review account/instructions entered
- [ ] Privacy Policy and Support URLs public
- [ ] Release archive uploaded and TestFlight smoke tested

## Production backend

- [x] Health API
- [x] Credit ledger model
- [x] Generation job model
- [x] Moderation/report model
- [x] Account deletion model
- [x] Purchase verification endpoints
- [x] Integrity verification endpoint contract
- [ ] PostgreSQL adapter connected (current runtime prototype still uses memory store)
- [ ] Redis/queue worker connected
- [ ] Object storage connected
- [ ] Actual AI provider selected and keys stored in secret manager
- [ ] Provider webhook verification implemented
- [ ] Google purchase remote verification implemented with official credentials
- [ ] Apple transaction remote verification implemented with official credentials
- [ ] Play Integrity remote verdict decoding implemented with official credentials
- [ ] Crash/error monitoring DSN configured
- [ ] Production domain/TLS configured
- [ ] Backups, retention and restore policy configured

## QA release gate

Release must not be submitted until all P0 items below pass:

1. Install/update/uninstall/reinstall.
2. Cold start without crash.
3. Offline start and reconnect.
4. Every navigation destination opens.
5. Every supported language changes without layout crash; Arabic RTL reviewed.
6. Prompt validation and moderation.
7. Quote -> generation job -> credit reservation.
8. Failed generation -> automatic refund exactly once.
9. Report generated output.
10. Purchase pending -> no credit; verified -> credit exactly once.
11. Restore purchase/subscription.
12. Account deletion.
13. Ad test units only during QA.
14. Phone, tablet and API 36 validation.
15. Release AAB installability through Play internal testing.
