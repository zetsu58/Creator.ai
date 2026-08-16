import { InferenceClient } from '@huggingface/inference';

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

type ProviderName = 'huggingface'|'replicate'|'mock'|string;

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
function hfProvider(){ return process.env.HF_INFERENCE_PROVIDER?.trim() || 'auto'; }

function normalizeProvider(value?:string):ProviderName {
  const explicit=value?.trim().toLowerCase();
  if(explicit==='hf') return 'huggingface';
  return explicit || 'mock';
}

function primaryProvider():ProviderName {
  const explicit=process.env.AI_PROVIDER_PRIMARY?.trim();
  if(explicit) return normalizeProvider(explicit);
  if(hfToken()) return 'huggingface';
  if(replicateToken()) return 'replicate';
  return 'mock';
}

function fallbackProvider():ProviderName {
  return normalizeProvider(process.env.AI_PROVIDER_FALLBACK);
}

function modelFor(job:GenerationJob) {
  if (job.type==='video' || job.type==='product_ad') return process.env.REPLICATE_VIDEO_MODEL?.trim() || 'prunaai/p-video';
  return process.env.REPLICATE_IMAGE_MODEL?.trim() || 'google/imagen-4-fast';
}

function hfModelFor(job:GenerationJob) {
  if (job.type==='video' || job.type==='product_ad') return process.env.HF_VIDEO_MODEL?.trim() || 'Wan-AI/Wan2.1-T2V-1.3B';
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

async function blobToDataUrl(blob:Blob, fallbackMime:string) {
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(!bytes.length) throw new Error('huggingface_empty_output');
  const mime=blob.type || fallbackMime;
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function huggingFaceRequest(job:GenerationJob):Promise<ProviderStart> {
  const token=hfToken();
  if(!token) throw new Error('hf_token_missing');
  const model=hfModelFor(job);
  const provider=hfProvider();
  const client=new InferenceClient(token);
  const isVideo=job.type==='video'||job.type==='product_ad';
  console.log('[huggingface] create',JSON.stringify({jobId:job.id,model,provider,task:isVideo?'text-to-video':'text-to-image'}));

  try {
    if(isVideo){
      const output=await client.textToVideo({
        model,
        inputs:job.prompt,
        provider:provider as any,
      });
      const dataUrl=await blobToDataUrl(output,'video/mp4');
      return {providerJobId:`hf:${job.id}`,status:'completed',outputUrl:dataUrl};
    }

    const output=await client.textToImage({
      model,
      inputs:job.prompt,
      provider:provider as any,
    });
    const dataUrl=await blobToDataUrl(output,'image/png');
    return {providerJobId:`hf:${job.id}`,status:'completed',outputUrl:dataUrl};
  } catch(e) {
    const message=String(e);
    throw new Error(`huggingface_request_failed:${message}`);
  }
}

async function replicateStart(job:GenerationJob):Promise<ProviderStart> {
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

function configured(provider:ProviderName) {
  if(provider==='huggingface') return Boolean(hfToken());
  if(provider==='replicate') return Boolean(replicateToken());
  return false;
}

export function providerDiagnostics() {
  return {
    provider: primaryProvider(),
    fallback: fallbackProvider(),
    hfTokenPresent: Boolean(hfToken()),
    hfInferenceProvider: hfProvider(),
    hfVideoModel: process.env.HF_VIDEO_MODEL?.trim() || 'Wan-AI/Wan2.1-T2V-1.3B',
    hfImageModel: process.env.HF_IMAGE_MODEL?.trim() || 'black-forest-labs/FLUX.1-schnell',
    replicateTokenPresent: Boolean(replicateToken()),
    videoModel: process.env.REPLICATE_VIDEO_MODEL?.trim() || 'prunaai/p-video',
    imageModel: process.env.REPLICATE_IMAGE_MODEL?.trim() || 'google/imagen-4-fast',
  };
}

export function providerConfigured() {
  return configured(primaryProvider()) || configured(fallbackProvider());
}

async function startWith(provider:ProviderName,job:GenerationJob):Promise<ProviderStart> {
  if(provider==='huggingface') return huggingFaceRequest(job);
  if(provider==='replicate') return replicateStart(job);
  throw new Error(`provider_not_configured:${provider}`);
}

export async function startProvider(job:GenerationJob):Promise<ProviderStart> {
  const primary=primaryProvider();
  const fallback=fallbackProvider();
  try {
    return await startWith(primary,job);
  } catch(primaryError) {
    const primaryMessage=String(primaryError);
    const fallbackAvailable=fallback!==primary && configured(fallback);
    console.log('[provider] primary_failed',JSON.stringify({jobId:job.id,primary,fallback,fallbackAvailable,error:primaryMessage.slice(0,700)}));
    if(!fallbackAvailable) throw primaryError;
    try {
      return await startWith(fallback,job);
    } catch(fallbackError) {
      throw new Error(`provider_primary_failed:${primaryMessage}; provider_fallback_failed:${String(fallbackError)}`);
    }
  }
}

export async function pollProvider(providerJobId:string):Promise<ProviderPoll> {
  if(providerJobId.startsWith('hf:')) return {status:'failed',error:'huggingface_completed_job_should_not_be_polled'};
  const body=await replicateRequest(`/v1/predictions/${encodeURIComponent(providerJobId)}`);
  const status=String(body.status||'').toLowerCase();
  if(status==='succeeded') return {status:'completed',outputUrl:outputUrl(body.output)};
  if(status==='failed'||status==='canceled') return {status:'failed',error:String(body.error||status)};
  return {status:'processing'};
}
