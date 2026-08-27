FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WAN_CODE_DIR=/opt/Wan2.2 \
    WAN_CKPT_DIR=/models/Wan2.2-TI2V-5B \
    VEYRA_GPU_DATA_DIR=/data

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv git git-lfs ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

WORKDIR /opt
RUN git clone --depth=1 https://github.com/Wan-Video/Wan2.2.git /opt/Wan2.2

RUN python3 -m pip install --upgrade pip setuptools wheel \
    && python3 -m pip install -r /opt/Wan2.2/requirements.txt

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN python3 -m pip install -r /app/requirements.txt
COPY app.py /app/app.py

RUN mkdir -p /data/jobs /data/inputs /data/outputs /models

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
