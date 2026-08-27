from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import subprocess
import threading
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("VEYRA_GPU_DATA_DIR", "/data"))
JOBS_DIR = DATA_DIR / "jobs"
INPUT_DIR = DATA_DIR / "inputs"
OUTPUT_DIR = DATA_DIR / "outputs"
DB_PATH = DATA_DIR / "jobs.sqlite3"
WAN_CODE_DIR = Path(os.getenv("WAN_CODE_DIR", "/opt/Wan2.2"))
WAN_CKPT_DIR = Path(os.getenv("WAN_CKPT_DIR", "/models/Wan2.2-TI2V-5B"))
API_SECRET = os.getenv("VEYRA_GPU_API_SECRET", "").strip()
PUBLIC_BASE_URL = os.getenv("VEYRA_GPU_PUBLIC_BASE_URL", "").rstrip("/")
MAX_QUEUE = int(os.getenv("VEYRA_GPU_MAX_QUEUE", "8"))
DEFAULT_STEPS = int(os.getenv("VEYRA_GPU_SAMPLE_STEPS", "40"))

for p in (DATA_DIR, JOBS_DIR, INPUT_DIR, OUTPUT_DIR):
    p.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Veyra GPU Worker", version="1.0.0")
_worker_lock = threading.Lock()


class GenerateRequest(BaseModel):
    requestId: str = Field(min_length=1, max_length=128)
    prompt: str = Field(min_length=3, max_length=4000)
    seconds: int = Field(default=5, ge=2, le=10)
    aspectRatio: str = Field(default="9:16")
    quality: str = Field(default="fast")
    imageUrl: Optional[str] = None
    seed: Optional[int] = None


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute(
        """
        create table if not exists jobs(
          id text primary key,
          request_id text not null unique,
          status text not null,
          prompt text not null,
          seconds integer not null,
          aspect_ratio text not null,
          quality text not null,
          image_url text,
          output_path text,
          error text,
          created_at integer not null,
          updated_at integer not null
        )
        """
    )
    con.commit()
    return con


def require_auth(authorization: Optional[str]) -> None:
    if not API_SECRET:
        raise HTTPException(status_code=503, detail="worker_secret_not_configured")
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="unauthorized")
    supplied = authorization[len(prefix):]
    if not hmac.compare_digest(supplied, API_SECRET):
        raise HTTPException(status_code=401, detail="unauthorized")


def safe_image_download(url: str, job_id: str) -> Path:
    if not (url.startswith("https://") or url.startswith("http://")):
        raise RuntimeError("invalid_image_url")
    req = urllib.request.Request(url, headers={"User-Agent": "VeyraGPU/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        content_type = (res.headers.get("content-type") or "").split(";")[0].lower()
        if content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise RuntimeError("unsupported_image_type")
        data = res.read(10 * 1024 * 1024 + 1)
        if len(data) > 10 * 1024 * 1024:
            raise RuntimeError("image_too_large")
    suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[content_type]
    path = INPUT_DIR / f"{job_id}{suffix}"
    path.write_bytes(data)
    return path


def dimensions(ratio: str) -> str:
    # Wan2.2 TI2V-5B official 720p sizes are 1280*704 or 704*1280.
    return "704*1280" if ratio == "9:16" else "1280*704"


def frame_count(seconds: int) -> int:
    # Official default is 121 frames; keep 4n+1 invariant.
    fps = 24
    frames = max(49, min(241, seconds * fps + 1))
    return ((frames - 1) // 4) * 4 + 1


def run_job(job_id: str, seed: Optional[int]) -> None:
    with _worker_lock:
        con = db()
        try:
            row = con.execute("select * from jobs where id=?", (job_id,)).fetchone()
            if not row:
                return
            con.execute("update jobs set status='processing',updated_at=? where id=?", (int(time.time()), job_id))
            con.commit()

            output_path = OUTPUT_DIR / f"{job_id}.mp4"
            image_path: Optional[Path] = None
            if row["image_url"]:
                image_path = safe_image_download(row["image_url"], job_id)

            cmd = [
                "python", str(WAN_CODE_DIR / "generate.py"),
                "--task", "ti2v-5B",
                "--size", dimensions(row["aspect_ratio"]),
                "--frame_num", str(frame_count(int(row["seconds"]))),
                "--ckpt_dir", str(WAN_CKPT_DIR),
                "--offload_model", "True",
                "--convert_model_dtype",
                "--t5_cpu",
                "--sample_steps", str(DEFAULT_STEPS),
                "--save_file", str(output_path),
                "--prompt", row["prompt"],
            ]
            if image_path:
                cmd += ["--image", str(image_path)]
            if seed is not None:
                cmd += ["--base_seed", str(seed)]

            env = os.environ.copy()
            env.setdefault("PYTHONUNBUFFERED", "1")
            proc = subprocess.run(
                cmd,
                cwd=str(WAN_CODE_DIR),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=int(os.getenv("VEYRA_GPU_JOB_TIMEOUT", "1800")),
            )
            log_path = JOBS_DIR / f"{job_id}.log"
            log_path.write_text(proc.stdout[-200000:], encoding="utf-8", errors="replace")
            if proc.returncode != 0 or not output_path.exists():
                raise RuntimeError(f"wan_generation_failed:{proc.returncode}:{proc.stdout[-1500:]}")

            con.execute(
                "update jobs set status='completed',output_path=?,updated_at=? where id=?",
                (str(output_path), int(time.time()), job_id),
            )
            con.commit()
        except Exception as exc:
            con.execute(
                "update jobs set status='failed',error=?,updated_at=? where id=?",
                (str(exc)[:4000], int(time.time()), job_id),
            )
            con.commit()
        finally:
            con.close()


@app.get("/health")
def health():
    gpu = False
    try:
        check = subprocess.run(["nvidia-smi", "-L"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=3)
        gpu = check.returncode == 0 and bool(check.stdout.strip())
    except Exception:
        gpu = False
    return {
        "ok": True,
        "gpu": gpu,
        "model": "Wan2.2-TI2V-5B",
        "checkpointPresent": WAN_CKPT_DIR.exists(),
        "codePresent": (WAN_CODE_DIR / "generate.py").exists(),
    }


@app.post("/v1/jobs", status_code=202)
def create_job(body: GenerateRequest, authorization: Optional[str] = Header(default=None)):
    require_auth(authorization)
    if body.aspectRatio not in {"9:16", "16:9", "1:1", "4:5"}:
        raise HTTPException(status_code=400, detail="unsupported_aspect_ratio")
    con = db()
    try:
        existing = con.execute("select id,status,output_path,error from jobs where request_id=?", (body.requestId,)).fetchone()
        if existing:
            return job_payload(existing)
        queued = con.execute("select count(*) c from jobs where status in ('queued','processing')").fetchone()["c"]
        if queued >= MAX_QUEUE:
            raise HTTPException(status_code=429, detail="gpu_queue_full")
        job_id = str(uuid.uuid4())
        now = int(time.time())
        con.execute(
            "insert into jobs(id,request_id,status,prompt,seconds,aspect_ratio,quality,image_url,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?)",
            (job_id, body.requestId, "queued", body.prompt, body.seconds, body.aspectRatio, body.quality, body.imageUrl, now, now),
        )
        con.commit()
        threading.Thread(target=run_job, args=(job_id, body.seed), daemon=True).start()
        return {"id": job_id, "status": "queued"}
    finally:
        con.close()


def job_payload(row: sqlite3.Row):
    output_url = None
    if row["status"] == "completed" and row["output_path"]:
        output_url = f"{PUBLIC_BASE_URL}/outputs/{row['id']}.mp4" if PUBLIC_BASE_URL else f"/outputs/{row['id']}.mp4"
    return {"id": row["id"], "status": row["status"], "outputUrl": output_url, "error": row["error"]}


@app.get("/v1/jobs/{job_id}")
def get_job(job_id: str, authorization: Optional[str] = Header(default=None)):
    require_auth(authorization)
    con = db()
    try:
        row = con.execute("select id,status,output_path,error from jobs where id=?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="job_not_found")
        return job_payload(row)
    finally:
        con.close()


@app.get("/outputs/{job_id}.mp4")
def output(job_id: str):
    # IDs are UUIDs generated by this worker, preventing arbitrary file access.
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="not_found")
    path = OUTPUT_DIR / f"{job_id}.mp4"
    if not path.exists():
        raise HTTPException(status_code=404, detail="not_found")
    return FileResponse(path, media_type="video/mp4", filename=f"veyra-{job_id}.mp4")
