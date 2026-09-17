import os, tempfile, uuid
from pathlib import Path
from typing import Literal, Optional
import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, HttpUrl, Field
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

app = FastAPI(title="Creator AI Photo Lab Worker", version="1.0.0")
TOKEN = os.getenv("PHOTO_LAB_WORKER_TOKEN", "")
OUT = Path(os.getenv("PHOTO_LAB_OUTPUT_DIR", "/tmp/photo-lab-output")); OUT.mkdir(parents=True, exist_ok=True)

class Request(BaseModel):
    userId: str
    assetUrl: HttpUrl
    operation: Literal['smart_enhance','upscale','erase','face_preserve','restore']
    preset: Literal['original','full_hd','2k','4k'] = 'full_hd'
    maskUrl: Optional[HttpUrl] = None
    strength: float = Field(.65, ge=0, le=1)
    preserveFace: bool = True
    stripMetadata: bool = True

@app.get('/health')
def health(): return {'ok': True, 'service':'creator-photo-lab-worker', 'engines': engines()}

def engines():
    return {
      'realesrgan': bool(os.getenv('REALESRGAN_MODEL_PATH')),
      'lama': bool(os.getenv('LAMA_MODEL_PATH')),
      'codeformer': bool(os.getenv('CODEFORMER_MODEL_PATH')),
      'fallback': 'pillow'
    }

def auth(value: Optional[str]):
    if TOKEN and value != f'Bearer {TOKEN}': raise HTTPException(401, 'unauthorized')

async def download(url: str, path: Path):
    async with httpx.AsyncClient(follow_redirects=True, timeout=45) as client:
        async with client.stream('GET', url) as r:
            r.raise_for_status()
            total = 0
            with path.open('wb') as f:
                async for chunk in r.aiter_bytes():
                    total += len(chunk)
                    if total > 25 * 1024 * 1024: raise HTTPException(413, 'asset_too_large')
                    f.write(chunk)

def target_size(img: Image.Image, preset: str):
    if preset == 'original': return img.size
    long_edge = {'full_hd':1920,'2k':2560,'4k':3840}[preset]
    ratio = long_edge / max(img.size)
    return tuple(max(1, round(x*ratio)) for x in img.size)

def fallback_pipeline(img: Image.Image, req: Request):
    img = ImageOps.exif_transpose(img).convert('RGB')
    if req.operation in ('smart_enhance','restore','face_preserve'):
        img = img.filter(ImageFilter.MedianFilter(3))
        img = ImageEnhance.Contrast(img).enhance(1.04)
    size = target_size(img, req.preset)
    if size != img.size: img = img.resize(size, Image.Resampling.LANCZOS)
    if req.operation != 'erase': img = img.filter(ImageFilter.UnsharpMask(radius=1.1, percent=70, threshold=4))
    return img

@app.post('/v1/process')
async def process(req: Request, authorization: Optional[str] = Header(None)):
    auth(authorization)
    if req.operation == 'erase' and not req.maskUrl: raise HTTPException(400, 'mask_required')
    # Adapter boundary: when model paths are configured, replace each fallback stage
    # with Real-ESRGAN / LaMa / CodeFormer inference while keeping this API stable.
    with tempfile.TemporaryDirectory() as d:
        source = Path(d)/'input'
        await download(str(req.assetUrl), source)
        try:
            with Image.open(source) as opened:
                if opened.width * opened.height > 50_000_000: raise HTTPException(413, 'too_many_pixels')
                img = fallback_pipeline(opened, req)
        except HTTPException: raise
        except Exception: raise HTTPException(415, 'invalid_image')
        name = f'{uuid.uuid4().hex}.jpg'; out = OUT/name
        img.save(out, 'JPEG', quality=95, optimize=True)
        public = os.getenv('PHOTO_LAB_OUTPUT_BASE_URL','').rstrip('/')
        return {'ok':True,'outputUrl': f'{public}/{name}' if public else f'file://{out}', 'engines':engines(), 'width':img.width,'height':img.height}
