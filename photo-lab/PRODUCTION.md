# Photo Lab production plan

## Architecture
Creator client -> authenticated upload -> Photo Lab job API -> queue -> GPU worker -> private object storage -> signed result URL.

## Required production adapters
1. Real-ESRGAN inference for conservative 2x/4x super-resolution.
2. LaMa-compatible inpainting for user-masked object removal.
3. CodeFormer/GFPGAN face restoration behind a low-strength identity-preserving default.
4. Object storage adapter for originals, masks and derived assets.
5. Durable queue (Redis/BullMQ or managed equivalent); in-memory jobs are development-only.

## Quality rules
- Never overwrite originals.
- Preserve EXIF orientation before processing; strip metadata on exported derivatives by default.
- Never stretch aspect ratio.
- Face restoration default strength must remain conservative.
- AUTO should prefer denoise/decompression before sharpening.
- Do not label ordinary interpolation as recovered real detail.
- Magic Eraser requires an explicit user mask.

## Security/privacy
- Authentication required on uploads, jobs and result retrieval.
- Validate magic bytes after download, not only MIME headers.
- 25 MB compressed limit and 50 MP decoded-pixel limit.
- Block SSRF: production worker must fetch only signed URLs from the configured asset host, not arbitrary public URLs.
- Short-lived signed URLs; random object keys; automatic deletion policy.
- Worker token stored only as a deployment secret.
- Rate limit job creation even for private deployments.
- No model weights or secrets in Git.

## UI completion
- Canvas-based brush/erase mask editor with zoom/pan.
- Before/after slider using identical geometry.
- Progress stages: upload, analyze, clean, restore, upscale, export.
- Cancel/retry, history and export sheet.
- PWA install manifest and offline shell.

## Acceptance gates
- Unit tests for planner/validation and API schemas.
- Integration test with a deterministic fixture image.
- Reject corrupt, decompression-bomb and oversized inputs.
- Verify orientation and aspect ratio.
- Verify erase cannot run without a mask.
- Verify original remains byte-identical after every operation.
- Benchmark Full HD/2K/4K memory and latency before enabling 4K by default.
