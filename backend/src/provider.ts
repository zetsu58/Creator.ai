export type GenerationJob = {
  id: string;
  type: 'image'|'video'|'product_ad'|'headshot'|'magic_edit';
  prompt: string;
  quality: string;
  aspectRatio?: string|null;
  seconds?: number|null;
  audio?: boolean|null;
};

export type ProviderStart = { providerJobId:string; status:'processing'|'completed'; outputUrl?:string|null };
export type ProviderPoll = { status:'processing'|'completed'|'failed'; outputUrl?:string|null; error?:string|null };

function outputUrl(value:any): string|null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(outputUrl).find(Boolean) ?? null;
  if (typeof value === 'object') {
    for (const key of ['url','video','image','output','file']) {
      const hit=outputUrl(value[key]); if(hit) return hit;
    }
  }
  return null;
}

function hfToken(){ return process.env.HF_TOKEN?.trim() || process.env.HUGGINGFACE_API_TOKEN?.trim() || ''; }
function replicateToken(){ return process.env.REPLICATE_API_TOKEN?.trim() || ''; }

function providerName() {
  const explicit=process.env.AI_PROVIDER_PRIMARY?.trim().toLowerCase();
  if (explicit==='huggingface' || explicit==='hf') return 'huggingface';
  if (explicit==='replicate') return 'replicate';
  if (explicit) return explicit;
  if (hfToken()) return 'huggingface';
  if (replicateToken()) return 'replicate';
  return 'mock';
}

function modelFor(job:GenerationJob) {
  if (job.type==='video' || job.type==='product_ad') return process.env.REPLICATE_VIDEO_MODEL?.trim() || 'prunaai/p-video';
  return process.env.REPLICATE_IMAGE_MODEL?.trim() || 'google/imagen-4-fast';
}

function hfModelFor(job:GenerationJob) {
  if (job.type==='video' || job.type==='product_ad') return process.env.HF_VIDEO_MODEL?.trim() || 'Wan-AI/Wan2.2-TI2V-5B';
  return process.env.HF_IMAGE_MODEL?.trim() || 'black-forest-labs/FLUX.1-schnell';
}

function replicateInput(job:GenerationJob) {
  const input:any={};
  input[process.env.REPLICATE_PROMPT_FIELD || 'prompt']=job.prompt;
  const aspectField=process.env.REPLICATE_ASPECT_RATIO_FIELD?.trim();
  if (job.aspectRatio && aspectField) input[aspectField]=job.aspectRatio;
  const durationField=process.env.REPLICATE_DURATION_FIELD?.trim();
  if (job.seconds && durationField && (job.type==='video'||job.type==='product_ad')) input[durationField]=job.seconds;
  const audioField=process.env.REPLICATE_AUDIO_FIELD?.trim();
  if (job.audio && audioField && (job.type==='video'||job.type==='product_ad')) input[audioField]=true;
  return input;
}

async function replicateRequest(path:string, init?:RequestInit) {
  const token=replicateToken();
  if(!token) throw new Error('replicate_token_missing');
  const headers=new Headers(init?.headers);
  headers.set('Authorization',`Bearer ${token}`);
  headers.set('Content-Type','application/json');
  const res=await fetch(`https://api.replicate.com${path}`,{...init,headers});
  const body:any=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`replicate_http_${res.status}:${body?.detail||body?.error||JSON.stringify(body)}`);
  return body;
}

async function huggingFaceRequest(job:GenerationJob):Promise<ProviderStart> {
  const token=hfToken();
  if(!token) throw new Error('hf_token_missing');
  const model=hfModelFor(job);
  const provider=process.env.HF_INFERENCE_PROVIDER?.trim() || 'auto';
  const task=(job.type==='video'||job.type==='product_ad')?'text-to-video':'text-to-image';
  const url=`https://router.huggingface.co/${encodeURIComponent(provider)}/models/${model.split('/').map(encodeURIComponent).join('/')}`;
  console.log('[huggingface] create',JSON.stringify({jobId:job.id,model,provider,task}));
  const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Wait-For-Model':'true'},body:JSON.stringify({inputs:job.prompt})});
  if(!res.ok){
    const text=(await res.text()).slice(0,900);
    throw new Error(`huggingface_http_${res.status}:${text}`);
  }
  const contentType=res.headers.get('content-type')||'';
  if(contentType.includes('application/json')){
    const body:any=await res.json();
    const urlOut=outputUrl(body);
    if(urlOut) return {providerJobId:`hf:${job.id}`,status:'completed',outputUrl:urlOut};
    throw new Error(`huggingface_unexpected_json:${JSON.stringify(body).slice(0,700)}`);
  }
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(!bytes.length) throw new Error('huggingface_empty_output');
  const mime=contentType.split(';')[0] || (task==='text-to-video'?'video/mp4':'image/png');
  const dataUrl=`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  return {providerJobId:`hf:${job.id}`,status:'completed',outputUrl:dataUrl};
}

export function providerDiagnostics() {
  return {
    provider: providerName(),
    hfTokenPresent: Boolean(hfToken()),
    hfInferenceProvider: process.env.HF_INFERENCE_PROVIDER?.trim() || 'auto',
    hfVideoModel: process.env.HF_VIDEO_MODEL?.trim() || 'Wan-AI/Wan2.2-TI2V-5B',
    hfImageModel: process.env.HF_IMAGE_MODEL?.trim() || 'black-forest-labs/FLUX.1-schnell',
    replicateTokenPresent: Boolean(replicateToken()),
    videoModel: process.env.REPLICATE_VIDEO_MODEL?.trim() || 'prunaai/p-video',
    imageModel: process.env.REPLICATE_IMAGE_MODEL?.trim() || 'google/imagen-4-fast',
  };
}

export function providerConfigured() {
  const p=providerName();
  return (p==='huggingface' && Boolean(hfToken())) || (p==='replicate' && Boolean(replicateToken()));
}

export async function startProvider(job:GenerationJob):Promise<ProviderStart> {
  const provider=providerName();
  if(provider==='huggingface') return huggingFaceRequest(job);
  if(provider!=='replicate') throw new Error(`provider_not_configured:${provider}`);
  const model=modelFor(job);
  const parts=model.split('/');
  if(parts.length!==2) throw new Error('replicate_model_must_be_owner_slash_name');
  const input=replicateInput(job);
  console.log('[replicate] create', JSON.stringify({jobId:job.id,model,inputKeys:Object.keys(input)}));
  const body=await replicateRequest(`/v1/models/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/predictions`,{method:'POST',headers:{'Cancel-After':'15m'},body:JSON.stringify({input})});
  const status=String(body.status||'').toLowerCase();
  if(status==='succeeded') return {providerJobId:String(body.id),status:'completed',outputUrl:outputUrl(body.output)};
  if(status==='failed'||status==='canceled') throw new Error(`replicate_start_${status}:${body.error||''}`);
  if(!body.id) throw new Error(`replicate_missing_prediction_id:${JSON.stringify(body)}`);
  return {providerJobId:String(body.id),status:'processing'};
}

export async function pollProvider(providerJobId:string):Promise<ProviderPoll> {
  if(providerJobId.startsWith('hf:')) return {status:'failed',error:'huggingface_completed_job_should_not_be_polled'};
  const body=await replicateRequest(`/v1/predictions/${encodeURIComponent(providerJobId)}`);
  const status=String(body.status||'').toLowerCase();
  if(status==='succeeded') return {status:'completed',outputUrl:outputUrl(body.output)};
  if(status==='failed'||status==='canceled') return {status:'failed',error:String(body.error||status)};
  return {status:'processing'};
}
