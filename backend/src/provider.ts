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

function providerName() {
  const explicit=process.env.AI_PROVIDER_PRIMARY?.trim().toLowerCase();
  if (explicit) return explicit;
  // If a Replicate token exists, Replicate is the sensible production default.
  if (process.env.REPLICATE_API_TOKEN?.trim()) return 'replicate';
  return 'mock';
}

function modelFor(job:GenerationJob) {
  if (job.type==='video' || job.type==='product_ad') {
    return process.env.REPLICATE_VIDEO_MODEL?.trim() || 'prunaai/p-video';
  }
  return process.env.REPLICATE_IMAGE_MODEL?.trim() || 'google/imagen-4-fast';
}

function replicateInput(job:GenerationJob) {
  const input:any={};
  input[process.env.REPLICATE_PROMPT_FIELD || 'prompt']=job.prompt;

  // Provider schemas differ. Optional fields are only sent when their mapping
  // has explicitly been configured in Render, preventing schema mismatches.
  const aspectField=process.env.REPLICATE_ASPECT_RATIO_FIELD?.trim();
  if (job.aspectRatio && aspectField) input[aspectField]=job.aspectRatio;

  const durationField=process.env.REPLICATE_DURATION_FIELD?.trim();
  if (job.seconds && durationField && (job.type==='video'||job.type==='product_ad')) input[durationField]=job.seconds;

  const audioField=process.env.REPLICATE_AUDIO_FIELD?.trim();
  if (job.audio && audioField && (job.type==='video'||job.type==='product_ad')) input[audioField]=true;

  return input;
}

async function replicateRequest(path:string, init?:RequestInit) {
  const token=process.env.REPLICATE_API_TOKEN?.trim() || '';
  if(!token) throw new Error('replicate_token_missing');
  const headers=new Headers(init?.headers);
  headers.set('Authorization',`Bearer ${token}`);
  headers.set('Content-Type','application/json');
  const res=await fetch(`https://api.replicate.com${path}`,{...init,headers});
  const body:any=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`replicate_http_${res.status}:${body?.detail||body?.error||JSON.stringify(body)}`);
  return body;
}

export function providerDiagnostics() {
  return {
    provider: providerName(),
    replicateTokenPresent: Boolean(process.env.REPLICATE_API_TOKEN?.trim()),
    videoModel: process.env.REPLICATE_VIDEO_MODEL?.trim() || 'prunaai/p-video',
    imageModel: process.env.REPLICATE_IMAGE_MODEL?.trim() || 'google/imagen-4-fast',
  };
}

export function providerConfigured() {
  return providerName()==='replicate' && Boolean(process.env.REPLICATE_API_TOKEN?.trim());
}

export async function startProvider(job:GenerationJob):Promise<ProviderStart> {
  const provider=providerName();
  if(provider!=='replicate') throw new Error(`provider_not_configured:${provider}`);
  const model=modelFor(job);
  if(!model) throw new Error(`replicate_model_missing:${job.type}`);
  const parts=model.split('/');
  if(parts.length!==2) throw new Error('replicate_model_must_be_owner_slash_name');
  const input=replicateInput(job);
  console.log('[replicate] create', JSON.stringify({jobId:job.id,model,inputKeys:Object.keys(input)}));
  const body=await replicateRequest(`/v1/models/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/predictions`,{
    method:'POST',
    headers:{'Cancel-After':'15m'},
    body:JSON.stringify({input}),
  });
  const status=String(body.status||'').toLowerCase();
  if(status==='succeeded') return {providerJobId:String(body.id),status:'completed',outputUrl:outputUrl(body.output)};
  if(status==='failed'||status==='canceled') throw new Error(`replicate_start_${status}:${body.error||''}`);
  if(!body.id) throw new Error(`replicate_missing_prediction_id:${JSON.stringify(body)}`);
  return {providerJobId:String(body.id),status:'processing'};
}

export async function pollProvider(providerJobId:string):Promise<ProviderPoll> {
  const provider=providerName();
  if(provider!=='replicate') return {status:'failed',error:`provider_not_configured:${provider}`};
  const body=await replicateRequest(`/v1/predictions/${encodeURIComponent(providerJobId)}`);
  const status=String(body.status||'').toLowerCase();
  if(status==='succeeded') return {status:'completed',outputUrl:outputUrl(body.output)};
  if(status==='failed'||status==='canceled') return {status:'failed',error:String(body.error||status)};
  return {status:'processing'};
}
