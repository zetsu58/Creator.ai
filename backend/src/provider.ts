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

function modelFor(job:GenerationJob) {
  if (job.type==='video' || job.type==='product_ad') return process.env.REPLICATE_VIDEO_MODEL?.trim() || '';
  return process.env.REPLICATE_IMAGE_MODEL?.trim() || '';
}

function replicateInput(job:GenerationJob) {
  const input:any={};
  input[process.env.REPLICATE_PROMPT_FIELD || 'prompt']=job.prompt;
  if (job.aspectRatio) input[process.env.REPLICATE_ASPECT_RATIO_FIELD || 'aspect_ratio']=job.aspectRatio;
  if (job.seconds && (job.type==='video'||job.type==='product_ad')) input[process.env.REPLICATE_DURATION_FIELD || 'duration']=job.seconds;
  if (job.audio && (job.type==='video'||job.type==='product_ad')) input[process.env.REPLICATE_AUDIO_FIELD || 'generate_audio']=true;
  return input;
}

async function replicateRequest(path:string, init?:RequestInit) {
  const token=process.env.REPLICATE_API_TOKEN?.trim() || '';
  if(!token) throw new Error('replicate_token_missing');
  const res=await fetch(`https://api.replicate.com${path}`,{
    ...init,
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init?.headers||{})},
  });
  const body:any=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`replicate_http_${res.status}:${body?.detail||body?.error||JSON.stringify(body)}`);
  return body;
}

export function providerConfigured() {
  const provider=(process.env.AI_PROVIDER_PRIMARY||'mock').toLowerCase();
  if(provider==='replicate') return Boolean(process.env.REPLICATE_API_TOKEN?.trim() && (process.env.REPLICATE_VIDEO_MODEL?.trim()||process.env.REPLICATE_IMAGE_MODEL?.trim()));
  return false;
}

export async function startProvider(job:GenerationJob):Promise<ProviderStart> {
  const provider=(process.env.AI_PROVIDER_PRIMARY||'mock').toLowerCase();
  if(provider!=='replicate') throw new Error('provider_not_configured');
  const model=modelFor(job);
  if(!model) throw new Error(`replicate_model_missing:${job.type}`);
  const parts=model.split('/');
  if(parts.length!==2) throw new Error('replicate_model_must_be_owner_slash_name');
  const body=await replicateRequest(`/v1/models/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/predictions`,{
    method:'POST',
    headers:{'Cancel-After':'15m'},
    body:JSON.stringify({input:replicateInput(job)}),
  });
  const status=String(body.status||'').toLowerCase();
  if(status==='succeeded') return {providerJobId:String(body.id),status:'completed',outputUrl:outputUrl(body.output)};
  if(status==='failed'||status==='canceled') throw new Error(`replicate_start_${status}:${body.error||''}`);
  return {providerJobId:String(body.id),status:'processing'};
}

export async function pollProvider(providerJobId:string):Promise<ProviderPoll> {
  const provider=(process.env.AI_PROVIDER_PRIMARY||'mock').toLowerCase();
  if(provider!=='replicate') return {status:'failed',error:'provider_not_configured'};
  const body=await replicateRequest(`/v1/predictions/${encodeURIComponent(providerJobId)}`);
  const status=String(body.status||'').toLowerCase();
  if(status==='succeeded') return {status:'completed',outputUrl:outputUrl(body.output)};
  if(status==='failed'||status==='canceled') return {status:'failed',error:String(body.error||status)};
  return {status:'processing'};
}
