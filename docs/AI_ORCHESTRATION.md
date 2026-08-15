# CreatorAI — Multi‑AI Orchestration

CreatorAI must feel like one assistant, even though the backend can route a job through several specialist models. The mobile client never needs to know which vendor completed which step.

## Product principle

User intent is more important than model choice. A user can write a short Turkish request such as:

> "Siyah spor arabayı İstanbul'da yağmurlu gecede premium reklam gibi yap."

CreatorAI should expand it into a structured production plan, preserve explicitly requested details, ask only when a missing detail is truly blocking, and otherwise make sensible cinematic defaults.

## 20 specialist capabilities

These are capability roles, not a promise that 20 paid vendor calls happen for every generation. Router policy selects only the specialists needed for that job.

1. Intent Interpreter — understand the actual user goal and output type.
2. Prompt Expander — enrich short prompts without changing user intent.
3. Requirement Lock — extract non-negotiable objects, text, colors, people and product details.
4. Scene Planner — split long requests into timed scenes.
5. Storyboard Planner — convert scenes into shots and transitions.
6. Camera Director — lens, framing, movement and shot continuity.
7. Lighting Director — lighting mood, reflections, time-of-day consistency.
8. Art Director — visual style, palette, material and composition.
9. Character Consistency — preserve subject identity across shots when supported.
10. Product Consistency — preserve logos, shape, packaging and product identity.
11. Text/Brand Guard — protect required slogans, brand wording and spelling.
12. Image Generator Router — choose the most suitable image model/profile.
13. Image Editor Router — choose edit/inpaint/background/upscale workflows.
14. Video Generator Router — choose FAST, QUALITY or CINEMATIC generation.
15. Motion Planner — define subject motion, speed and physical behavior.
16. Audio Director — plan ambience, SFX, dialogue, music and voice-over.
17. Safety & Rights Check — block disallowed requests and risky impersonation workflows.
18. Quality Critic — inspect produced media against the locked requirements.
19. Repair Agent — retry only failed constraints instead of blindly regenerating everything.
20. Cost Optimizer — choose the lowest-cost route that still meets the requested quality.

## Generation pipeline

`USER REQUEST`
→ Intent Interpreter
→ Requirement Lock
→ Prompt Expander
→ Scene / Camera / Art / Audio planning
→ Cost estimate + credit authorization
→ Provider Router
→ Generation
→ Quality Critic
→ Repair Agent when score is below threshold
→ Final deliverable
→ Project history + credit settlement

## Provider strategy

The system is vendor-neutral. Current integrations can be evaluated from official APIs and replaced without a mobile update.

Suggested capability profiles:

- TEXT_REASONING
- IMAGE_FAST
- IMAGE_QUALITY
- IMAGE_EDIT
- VIDEO_FAST
- VIDEO_QUALITY
- VIDEO_CINEMATIC
- VIDEO_REFERENCE
- VIDEO_EXTEND
- AUDIO_VOICE
- AUDIO_MUSIC
- UPSCALE
- MODERATION
- VISION_QA

A profile maps to an adapter configured in the CreatorAI backend. Provider API keys and model IDs are server-side configuration only.

## Quality contract

Every job stores a `locked_requirements` object. Example:

```json
{
  "must_keep": ["black sports car", "Istanbul at night", "rain"],
  "must_not_add": ["visible license plate", "daylight"],
  "style": "premium automotive commercial",
  "aspect_ratio": "9:16",
  "duration_seconds": 8,
  "camera": ["front tracking", "right-side orbit"],
  "audio": "cinematic rain ambience"
}
```

The critic compares the generated result against this contract. A generation is not marked `completed` only because a provider returned a file; it must also pass CreatorAI validation.

## Repair instead of waste

If the video is good but one condition fails, CreatorAI should try a targeted correction when the selected provider supports it. Examples:

- wrong product color → edit/regenerate affected shot
- logo distorted → protect/reference product and retry shot
- camera movement missing → regenerate motion segment
- spelling problem → render text as deterministic overlay rather than generative text
- wrong aspect ratio → regenerate/crop only when safe

This reduces user frustration and API spend.

## Turkish-first intelligence

Users can write naturally in Turkish. The orchestrator stores the original prompt and a normalized structured prompt. It must not translate brand names, proper nouns, quoted slogans or requested on-screen text unless the user asks.

## UI behavior

The UI exposes helpful controls without showing internal complexity:

- "Promptumu Güçlendir"
- "Sahnelere Böl"
- "Ürünü Koru"
- "Karakteri Koru"
- "Kamera Yönetmeni"
- "Sinematik Işık"
- "Ses Ekle"
- "Kalite Kontrol"

Advanced users can open a `Director Mode` panel. Beginners can stay in `Smart Mode` where CreatorAI chooses defaults.

## Current official API observations

As of 2026-08-15, Google documents Veo 3.1 with text/image-guided video generation, portrait/landscape output, video extension, first/last-frame control, reference images and native audio. Runway documents image-to-video APIs and supports multiple current generation models through one API surface. These capabilities fit the adapter/router architecture and should be treated as replaceable providers rather than hard dependencies.

## Non-negotiable engineering rules

- No provider secrets in Flutter or static admin frontend.
- No credit charge until server-side authorization succeeds.
- Idempotent job IDs and payment IDs.
- Failed generation → automatic credit release/refund.
- Store source prompt, normalized prompt, provider profile, cost, QA score and repair attempts.
- Admin can disable a provider/model without shipping a new app.
- Cost ceilings per user/plan prevent runaway API spend.
