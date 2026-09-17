# No-build deployment

This web client is static HTML/CSS/JS. Do not configure `npm`, Flutter, Android, or GitHub Actions for this directory.

Preferred deployment settings:
- Root directory: `photo-lab/web`
- Framework preset: Other / Static
- Build command: empty
- Output directory: `.`

The UI can be deployed separately from the API. Set the API base in the integration layer when the backend has a public HTTPS address. Image processing remains server-side; the static host never needs GPU resources.
