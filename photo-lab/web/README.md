# Creator AI Photo Lab Web

Mobile-first browser client for Creator AI's private Photo Lab.

This directory is deliberately framework-light so it can be hosted as static assets and does not require a GitHub Actions build. `PhotoLabClient` owns job creation/polling/cancellation, `CompareSlider` renders before/after output, `MaskEditor` owns user-painted erase masks, and the service worker caches only the application shell.

Do not cache uploaded photographs or generated result responses in the service worker. Production image assets should use short-lived private signed URLs.

The browser module expects the backend endpoints under `/v1/photo-lab` and a separate signed-upload endpoint supplied by the existing Creator backend/storage adapter.
