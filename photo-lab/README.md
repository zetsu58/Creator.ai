# Creator AI — Photo Lab

Private-first professional photo enhancement module for Creator AI.

## Goals
- One-tap Smart Enhance
- Full HD / 2K / 4K upscale
- Magic Eraser with user-painted masks
- Face Preserve mode
- Compression/noise cleanup
- Before/after comparison
- Non-destructive edits and export
- Local/private processing option

## Pipeline
`decode -> orientation/color normalize -> analysis -> denoise/deblur -> optional inpaint -> optional face preservation -> upscale -> conservative sharpen -> encode`

The orchestration layer is provider-agnostic. Heavy models can run on a dedicated GPU worker while Creator AI remains the client/API layer.

## Suggested model adapters
- Upscale: Real-ESRGAN compatible adapter
- Inpainting: LaMa compatible adapter
- Face restoration: CodeFormer/GFPGAN compatible adapter
- Classical preprocessing: OpenCV/Pillow

Model weights are intentionally not committed to Git.

## Auto Director
Auto Director inspects basic image characteristics and chooses a conservative processing recipe. It does not fabricate detail unnecessarily and prioritizes identity/geometry preservation.

## Privacy
Uploads should use short-lived job storage. Originals are immutable; every operation creates a derived result. Production deployments should enforce authentication, MIME/magic-byte validation, size/pixel limits, randomized filenames, metadata stripping on export, and automatic cleanup.

## API contract
See `contracts.ts` and `pipeline.ts` for the initial typed architecture.
