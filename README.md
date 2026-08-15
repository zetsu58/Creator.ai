# CreatorAI

CreatorAI is an AI-first mobile content studio for image and video creation.

## MVP focus

- AI Image Studio
- AI Video Studio
- Prompt enhancement
- Reference-image workflows
- Credit wallet and generation cost preview
- Projects/history
- Provider-agnostic backend routing
- Rewarded ads and paid credit packs (planned)
- Creator/Pro/Business plans (planned)

## Architecture

The mobile app never stores AI-provider secret keys. Generations will be requested through the CreatorAI backend, where credit validation, provider routing, job state, moderation, retries and refunds are handled.

## Mobile

Flutter project name: `creator_ai`

Target Flutter: 3.44.x stable.

The Android CI workflow regenerates missing platform scaffolding with `flutter create` so the repository can stay clean while the MVP is being bootstrapped.
