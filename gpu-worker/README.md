# Veyra GPU Worker

Self-hosted inference service for Veyra AI. The first production target is `Wan2.2-TI2V-5B`, which supports both text-to-video and image-to-video.

## Architecture

Veyra Web / Flutter -> Vercel Node API -> Veyra GPU Worker -> Wan2.2 -> MP4 output

The Node backend authenticates to this service with `VEYRA_GPU_API_SECRET`. Users never receive the worker secret.

## GPU requirements

The official Wan2.2 TI2V-5B project documents 720p generation on a GPU with at least 24 GB VRAM (for example RTX 4090) using model offload, converted model dtype and T5 on CPU.

Recommended first production worker:

- NVIDIA GPU with >= 24 GB VRAM
- >= 64 GB system RAM
- >= 100 GB persistent disk for checkpoints, caches and outputs
- NVIDIA Container Toolkit
- HTTPS reverse proxy or a GPU platform that supplies TLS

## Persistent volumes

Mount:

- `/models` for model checkpoints
- `/data` for SQLite job state, inputs, logs and outputs

Do not use ephemeral storage for production outputs.

## Model download

Download the official `Wan2.2-TI2V-5B` checkpoint into:

`/models/Wan2.2-TI2V-5B`

For example, on the GPU host with Hugging Face CLI available:

```bash
huggingface-cli download Wan-AI/Wan2.2-TI2V-5B --local-dir /models/Wan2.2-TI2V-5B
```

## Required worker environment

```env
VEYRA_GPU_API_SECRET=<random 48+ char secret>
VEYRA_GPU_PUBLIC_BASE_URL=https://gpu.veyra.ai
WAN_CODE_DIR=/opt/Wan2.2
WAN_CKPT_DIR=/models/Wan2.2-TI2V-5B
VEYRA_GPU_DATA_DIR=/data
VEYRA_GPU_MAX_QUEUE=8
VEYRA_GPU_JOB_TIMEOUT=1800
VEYRA_GPU_SAMPLE_STEPS=40
```

Generate a secret with a cryptographically secure password generator. Never commit it.

## Build and run

```bash
docker build -t veyra-gpu-worker ./gpu-worker

docker run --gpus all --restart unless-stopped \
  -p 8080:8080 \
  -v /srv/veyra/models:/models \
  -v /srv/veyra/data:/data \
  --env-file /srv/veyra/gpu-worker.env \
  veyra-gpu-worker
```

Health check:

```bash
curl https://gpu.veyra.ai/health
```

Expected fields include `gpu: true`, `checkpointPresent: true` and `codePresent: true` before enabling it as the primary provider.

## Vercel production environment

Only after the GPU worker is healthy, configure the Vercel project:

```env
AI_PROVIDER_PRIMARY=veyra_gpu
AI_PROVIDER_FALLBACK=runway
VEYRA_GPU_BASE_URL=https://gpu.veyra.ai
VEYRA_GPU_API_SECRET=<same secret as worker>
```

Redeploy after changing Vercel environment variables.

## API

### POST /v1/jobs

Authenticated with `Authorization: Bearer <secret>`.

```json
{
  "requestId": "generation-job-id",
  "prompt": "cinematic product video",
  "seconds": 5,
  "aspectRatio": "9:16",
  "quality": "fast",
  "imageUrl": null
}
```

`requestId` is unique and provides idempotent job creation.

### GET /v1/jobs/{id}

Returns `queued`, `processing`, `completed` or `failed`. Completed jobs include `outputUrl`.

## Security notes

- Worker API is authenticated server-to-server.
- Input downloads have MIME and 10 MB limits.
- Output file paths only accept worker-generated UUIDs.
- The worker serializes GPU generation with a process lock to prevent accidental VRAM overcommit on a single GPU.
- The production reverse proxy should rate-limit requests and only permit Veyra backend traffic where platform networking allows it.

## Next scale step

The v1 worker intentionally uses persistent SQLite job state and one GPU execution lane. When traffic requires multiple GPU nodes, replace the local queue with Redis/PostgreSQL-backed dispatch while keeping the same `/v1/jobs` contract, so the Veyra web/backend code does not need to change.
