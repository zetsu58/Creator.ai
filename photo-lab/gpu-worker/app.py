import os,tempfile,uuid,ipaddress,socket
from pathlib import Path
from typing import Literal,Optional
from urllib.parse import urlparse
import httpx
from fastapi import FastAPI,Header,HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel,HttpUrl,Field
from PIL import Image,ImageEnhance,ImageFilter,ImageOps

app=FastAPI(title='Creator AI Photo Lab Worker',version='1.1.0')
TOKEN=os.getenv('PHOTO_LAB_WORKER_TOKEN','');OUT=Path(os.getenv('PHOTO_LAB_OUTPUT_DIR','/tmp/photo-lab-output'));OUT.mkdir(parents=True,exist_ok=True)
ALLOWED={x.strip().lower() for x in os.getenv('PHOTO_LAB_ALLOWED_ASSET_HOSTS','').split(',') if x.strip()}
class Request(BaseModel):
 userId:str;assetUrl:HttpUrl;operation:Literal['smart_enhance','upscale','erase','face_preserve','restore'];preset:Literal['original','full_hd','2k','4k']='full_hd';maskUrl:Optional[HttpUrl]=None;strength:float=Field(.65,ge=0,le=1);preserveFace:bool=True;stripMetadata:bool=True

def auth(v):
 if not TOKEN: raise HTTPException(503,'worker_token_not_configured')
 if v!=f'Bearer {TOKEN}': raise HTTPException(401,'unauthorized')
def safe_url(raw):
 u=urlparse(str(raw));host=(u.hostname or '').lower()
 if u.scheme!='https' or not host: raise HTTPException(400,'invalid_asset_url')
 if ALLOWED and host not in ALLOWED: raise HTTPException(403,'asset_host_not_allowed')
 try:
  for x in socket.getaddrinfo(host,443,type=socket.SOCK_STREAM):
   ip=ipaddress.ip_address(x[4][0]);
   if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast: raise HTTPException(403,'private_asset_host')
 except HTTPException: raise
 except Exception: raise HTTPException(400,'asset_host_unresolved')
 return str(raw)
async def download(url,path):
 url=safe_url(url)
 async with httpx.AsyncClient(follow_redirects=False,timeout=45) as c:
  async with c.stream('GET',url) as r:
   r.raise_for_status();total=0
   with path.open('wb') as f:
    async for chunk in r.aiter_bytes():
     total+=len(chunk)
     if total>25*1024*1024: raise HTTPException(413,'asset_too_large')
     f.write(chunk)
def engines(): return {'realesrgan':bool(os.getenv('REALESRGAN_MODEL_PATH')),'lama':bool(os.getenv('LAMA_MODEL_PATH')),'codeformer':bool(os.getenv('CODEFORMER_MODEL_PATH')),'fallback':'pillow'}
@app.get('/health')
def health(): return {'ok':True,'service':'creator-photo-lab-worker','engines':engines()}
def target_size(img,p):
 if p=='original':return img.size
 edge={'full_hd':1920,'2k':2560,'4k':3840}[p];ratio=edge/max(img.size);return tuple(max(1,round(x*ratio)) for x in img.size)
def fallback(img,req):
 img=ImageOps.exif_transpose(img).convert('RGB')
 if req.operation in ('smart_enhance','restore','face_preserve'):img=img.filter(ImageFilter.MedianFilter(3));img=ImageEnhance.Contrast(img).enhance(1.04)
 size=target_size(img,req.preset)
 if size!=img.size:img=img.resize(size,Image.Resampling.LANCZOS)
 if req.operation!='erase':img=img.filter(ImageFilter.UnsharpMask(radius=1.1,percent=70,threshold=4))
 return img
@app.get('/outputs/{name}')
def output(name:str,authorization:Optional[str]=Header(None)):
 auth(authorization)
 if not name.endswith('.jpg') or '/' in name or '..' in name:raise HTTPException(404)
 p=OUT/name
 if not p.exists():raise HTTPException(404)
 return FileResponse(p,media_type='image/jpeg',headers={'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'})
@app.post('/v1/process')
async def process(req:Request,authorization:Optional[str]=Header(None)):
 auth(authorization)
 if req.operation=='erase' and not req.maskUrl:raise HTTPException(400,'mask_required')
 with tempfile.TemporaryDirectory() as d:
  source=Path(d)/'input';await download(req.assetUrl,source)
  try:
   with Image.open(source) as opened:
    if opened.width*opened.height>50_000_000:raise HTTPException(413,'too_many_pixels')
    img=fallback(opened,req)
  except HTTPException:raise
  except Exception:raise HTTPException(415,'invalid_image')
  name=f'{uuid.uuid4().hex}.jpg';out=OUT/name;img.save(out,'JPEG',quality=95,optimize=True)
  public=os.getenv('PHOTO_LAB_OUTPUT_BASE_URL','').rstrip('/')
  return {'ok':True,'outputUrl':f'{public}/outputs/{name}' if public else f'/outputs/{name}','engines':engines(),'width':img.width,'height':img.height}
