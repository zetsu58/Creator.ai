export type OmniRouteMediaJob = {
  id: string;
  type: 'image'|'video'|'product_ad'|'headshot'|'magic_edit';
  prompt: string;
  quality: string;
  aspectRatio?: string|null;
  seconds?: number|null;
  audio?: boolean|null;
  imageUrl?: string|null;
};

export type OmniRouteStart = {
  providerJobId: string;
  status: 'processing'|'completed';
  outputUrl?: string|null;
};

export type OmniRoutePoll = {
  status: 'processing'|'completed'|'failed';
  outputUrl?: string|null;
  error?: string|null;
};

const baseUrl = () => (process.env.OMNIROUTE_BASE_URL?.trim() || '').replace(/\/$/, '');
const apiKey = () => process.env.OMNIROUTE_API_KEY?.trim() || '';

export function omniRouteConfigured() { return Boolean(baseUrl() && apiKey()); }

export function omniRouteDiagnostics() {
  return {
    configured: omniRouteConfigured(), baseUrlPresent: Boolean(baseUrl()), apiKeyPresent: Boolean(apiKey()),
    imageModel: process.env.OMNIROUTE_IMAGE_MODEL?.trim() || null,
    videoModel: process.env.OMNIROUTE_VIDEO_MODEL?.trim() || null,
  };
}

function mediaUrl(value: any): string|null {
  if (!value) return null;
  if (typeof value === 'string') { const v=value.trim(); return /^https?:\/\//i.test(v)||/^data:/i.test(v)?v:null; }
  if (Array.isArray(value)) { for (const item of value) { const found=mediaUrl(item); if(found)return found; } return null; }
  if (typeof value === 'object') { for (const key of ['url','video_url','image_url','output','data','result','file']) { const found=mediaUrl(value[key]); if(found)return found; } }
  return null;
}

async function request(path: string, init?: RequestInit, timeoutMs=30_000) {
  const base=baseUrl(), key=apiKey(); if(!base||!key) throw new Error('omniroute_not_configured');
  const headers=new Headers(init?.headers); headers.set('Authorization',`Bearer ${key}`); if(!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try { const res=await fetch(`${base}${path}`,{...init,headers,signal:controller.signal}); const raw=await res.text(); let body:any={}; try{body=raw?JSON.parse(raw):{}}catch{body={raw}};
    if(!res.ok){const msg=body?.error?.message||body?.message||body?.error||raw; throw new Error(`omniroute_http_${res.status}:${String(msg).slice(0,1600)}`);} return body;
  } finally { clearTimeout(timer); }
}

function imageSize(aspect?:string|null){switch((aspect||'1:1').trim()){case'16:9':return'1536x864';case'9:16':return'864x1536';case'4:3':return'1536x1152';case'3:4':return'1152x1536';default:return'1024x1024';}}
function videoSize(aspect?:string|null){return(aspect||'9:16').trim()==='16:9'?'1280x720':'720x1280';}

function modelIds(body:any):string[]{
  const rows=Array.isArray(body)?body:Array.isArray(body?.data)?body.data:Array.isArray(body?.models)?body.models:[];
  return rows.map((x:any)=>typeof x==='string'?x:String(x?.id||x?.model||x?.name||'')).filter(Boolean);
}

async function resolveVideoModel(configured:string):Promise<string>{
  // OmniRoute validates /v1/videos/generations against its live video registry. If the configured alias
  // is stale, ask the authenticated model catalog and select the exact provider-prefixed equivalent.
  let ids:string[]=[];
  try { ids=modelIds(await request('/v1/models',{method:'GET'},15_000)); } catch { return configured; }
  if(ids.includes(configured)) return configured;
  const leaf=configured.includes('/')?configured.split('/').slice(1).join('/'):configured;
  const exactLeaf=ids.find(id=>id===leaf||id.endsWith(`/${leaf}`));
  if(exactLeaf) return exactLeaf;
  const seedance=ids.find(id=>/seedance[-_.]?2(?:\.0)?[-_.]?fast/i.test(id));
  if(seedance) return seedance;
  return configured;
}

export async function omniRouteStart(job:OmniRouteMediaJob):Promise<OmniRouteStart>{
  const isVideo=job.type==='video'||job.type==='product_ad';
  if(isVideo){
    const configured=process.env.OMNIROUTE_VIDEO_MODEL?.trim(); if(!configured)throw new Error('omniroute_video_model_missing');
    const model=await resolveVideoModel(configured);
    const seconds=Math.max(2,Math.min(15,Math.round(Number(job.seconds||5))));
    const body:any={model,prompt:job.prompt.trim(),duration:String(seconds),aspect_ratio:job.aspectRatio||'9:16',size:videoSize(job.aspectRatio)};
    if(job.imageUrl?.trim())body.input=[{type:'text',text:job.prompt.trim()},{type:'image',image:job.imageUrl.trim()}];
    const out=await request('/v1/videos/generations',{method:'POST',headers:{'Idempotency-Key':job.id},body:JSON.stringify(body)},60_000);
    const status=String(out?.status||'').toLowerCase(), url=mediaUrl(out);
    if((status==='completed'||status==='succeeded'||status==='success')&&url)return{providerJobId:`omniroute:${String(out?.id||job.id)}`,status:'completed',outputUrl:url};
    const id=String(out?.id||out?.task_id||out?.video_id||'').trim(); if(!id)throw new Error(`omniroute_missing_video_id:${JSON.stringify(out).slice(0,1200)}`);
    return{providerJobId:`omniroute:${id}`,status:'processing'};
  }
  const model=process.env.OMNIROUTE_IMAGE_MODEL?.trim(); if(!model)throw new Error('omniroute_image_model_missing');
  const out=await request('/v1/images/generations',{method:'POST',headers:{'Idempotency-Key':job.id},body:JSON.stringify({model,prompt:job.prompt.trim(),n:1,size:imageSize(job.aspectRatio),response_format:'url'})},120_000);
  const url=mediaUrl(out); if(!url)throw new Error(`omniroute_missing_image_url:${JSON.stringify(out).slice(0,1200)}`);
  return{providerJobId:`omniroute:${job.id}`,status:'completed',outputUrl:url};
}

export async function omniRoutePoll(providerJobId:string):Promise<OmniRoutePoll>{
  const id=providerJobId.startsWith('omniroute:')?providerJobId.slice('omniroute:'.length):providerJobId;
  const out=await request(`/v1/videos/${encodeURIComponent(id)}`,{method:'GET'},30_000), status=String(out?.status||'').toLowerCase();
  if(status==='completed'||status==='succeeded'||status==='success'){const url=mediaUrl(out);return url?{status:'completed',outputUrl:url}:{status:'failed',error:'omniroute_completed_without_output'};}
  if(status==='failed'||status==='canceled'||status==='cancelled'||status==='expired')return{status:'failed',error:String(out?.error?.message||out?.error||status)};
  return{status:'processing'};
}
