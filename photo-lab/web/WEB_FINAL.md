# Web-first delivery

Photo Lab is a browser-first product. Android APK is not required for normal use.

## User journey
1. Open Creator AI Photo Lab in a mobile browser.
2. Select a local JPG/PNG/WebP image.
3. Choose AUTO, Erase, Upscale, Face Preserve or Restore.
4. Upload to private asset storage using a short-lived signed upload URL.
5. Create a Photo Lab job.
6. Show live stage/progress while the worker processes the asset.
7. Render an identical-geometry before/after slider.
8. Export the derived image; original remains unchanged.

## Cost strategy
- No CI build is required to develop or serve the web UI.
- GitHub Actions APK workflow stays manual-only.
- Static web assets can be served by the existing web host/CDN.
- Backend and image worker deploy independently, so a GPU is used only when an image job needs it.
- 4K should be opt-in because it consumes more worker memory/time.

## Production blockers
- Signed upload/object-storage adapter.
- Worker output must be written to private object storage instead of local `file://` output.
- Real model inference adapters must be provisioned before claiming AI super-resolution/inpainting.
- Magic Eraser mask editor must be connected to signed mask upload.
- Authentication/ownership checks must replace development `userId` trust.
- SSRF allow-list must restrict worker downloads to the configured private asset host.

## Definition of done
A phone browser can upload an image, submit a job, observe progress, compare before/after and save the result without GitHub Actions or an Android build.
