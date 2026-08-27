import { InferenceClient } from '@huggingface/inference';

export type GenerationJob = {
  id: string;
  type: 'image'|'video'|'product_ad'|'headshot'|'magic_edit';
  prompt: string;
  quality: string;
  aspectRatio?: string|null;
  seconds?: number|null;
  audio?: boolean|null;
  imageUrl?: string|null;
};
export type ProviderStart={providerJobId:string;status:'processing'|'completed';outputUrl?:string|null};
export type ProviderPoll={status:'processing'|'completed'|'failed';outputUrl?:string|null;error?:string|null};
type ProviderName='runway'|'huggingface'|'replicate'|'mock'|string;

function outputUrl(v:any):string|null{if(!v)return null;if(typeof v==='string')return v;if(Array.isArray(v))return v.map(outputUrl).find(Boolean)??null;if(typeof v==='object'){for(const k of ['url','video','image','output','file']){const x=outputUrl(v[k]);if(x)return x;}}return null;}
const runwayToken=()=>process.env.RUNWAYML_API_SECRET?.trim()||process.env.RUNWAY_API_KEY?.trim()||'';
const hfToken=()=>process.env.HF_TOKEN?.trim()||process.env.HUGGINGFACE_API_TOKEN?.trim()||'';
const replicateToken=()=>process.env.REPLICATE_API_TOKEN?.trim()||'';
const hfProvider=()=>process.env.HF_INFERENCE_PROVIDER?.trim()||'auto';
function normalizeProvider(v?:string):ProviderName{const x=v?.trim().toLowerCase();if(x==='hf')return'huggingface';return x||'mock';}
function primaryProvider():ProviderName{const x=process.env.AI_PROVIDER_PRIMARY?.trim();if(x)return normalizeProvider(x);if(runwayToken())return'runway';if(hfToken())return'huggingface';if(replicateToken())return'replicate';return'mock';}
function fallbackProvider():ProviderName{return normalizeProvider(process.env.AI_PROVIDER_FALLBACK);}
function modelFor(j:GenerationJob){return(j.type==='video'||j.type==='product_ad')?(process.env.REPLICATE_VIDEO_MODEL?.trim()||'prunaai/p-video'):(process.env.REPLICATE_IMAGE_MODEL?.trim()||'google/imagen-4-fast');}
function hfModelFor(j:GenerationJob){return(j.type==='video'||j.type==='product_ad')?(process.env.HF_VIDEO_MODEL?.trim()||'Lightricks/LTX-Video-0.9.8-13B-distilled'):(process.env.HF_IMAGE_MODEL?.trim()||'black-forest-labs/FLUX.1-schnell');}
function runwayRatio(j:GenerationJob){const r=(j.aspectRatio||'16:9').trim();if(r==='9:16'||r==='720:1280')return'720:1280';return'1280:720';}
async function runwayRequest(path:string,init?:RequestInit){const token=runwayToken();if(!token)throw new Error('runway_token_missing');const h=new Headers(init?.headers);h.set('Authorization',`Bearer ${token}`);h.set('X-Runway-Version','2024-11-06');h.set('Content-Type','application/json');const res=await fetch(`https://api.dev.runwayml.com${path}`,{...init,headers:h});const body:any=await res.json().catch(()=>({}));if(!res.ok)throw new Error(`runway_http_${res.status}:${body?.error||body?.message||JSON.stringify(body)}`);return body;}
async function runwayStart(j:GenerationJob):Promise<ProviderStart>{if(j.type!=='video'&&j.type!=='product_ad')throw new Error(`runway_unsupported_job_type:${j.type}`);const model=process.env.RUNWAY_VIDEO_MODEL?.trim()||'gen4.5';const duration=Math.max(2,Math.min(10,Number(j.seconds||5)));const body:any={model,promptText:j.prompt,ratio:runwayRatio(j),duration};const image=j.imageUrl?.trim();if(image)body.promptImage=image;
  // Gen-4.5 text-to-video and image-to-video share the image_to_video generation API;
  // omitting promptImage selects text-only generation. This matches Runway's current API contract.
  const out=await runwayRequest('/v1/image_to_video',{method:'POST',body:JSON.stringify(body)});if(!out.id)throw new Error(`runway_missing_task_id:${JSON.stringify(out)}`);return{providerJobId:`runway:${out.id}`,status:'processing'};}
async function runwayPoll(id:string):Promise<ProviderPoll>{const out=await runwayRequest(`/v1/tasks/${encodeURIComponent(id)}`);const s=String(out.status||'').toUpperCase();if(s==='SUCCEEDED')return{status:'completed',outputUrl:outputUrl(out.output)};if(s==='FAILED'||s==='CANCELED')return{status:'failed',error:String(out.failure||out.failureCode||s)};return{status:'processing'};}
function replicateInput(j:GenerationJob){const input:any={};input[process.env.REPLICATE_PROMPT_FIELD||'prompt']=j.prompt;const a=process.env.REPLICATE_ASPECT_RATIO_FIELD?.trim();if(j.aspectRatio&&a)input[a]=j.aspectRatio;const d=process.env.REPLICATE_DURATION_FIELD?.trim();if(j.seconds&&d&&(j.type==='video'||j.type==='product_ad'))input[d]=j.seconds;return input;}
async function replicateRequest(path:string,init?:RequestInit){const token=replicateToken();if(!token)throw new Error('replicate_token_missing');const h=new Headers(init?.headers);h.set('Authorization',`Bearer ${token}`);h.set('Content-Type','application/json');const res=await fetch(`https://api.replicate.com${path}`,{...init,headers:h});const body:any=await res.json().catch(()=>({}));if(!res.ok)throw new Error(`replicate_http_${res.status}:${body?.detail||body?.error||JSON.stringify(body)}`);return body;}
async function hfOutputToUrl(value:unknown,mime:string){if(typeof value==='string'&&value.trim())return value.trim();if(value instanceof Blob){const b=new Uint8Array(await value.arrayBuffer());if(!b.length)throw new Error('huggingface_empty_output');return`data:${value.type||mime};base64,${Buffer.from(b).toString('base64')}`;}const url=outputUrl(value);if(url)return url;throw new Error('huggingface_output_unsupported');}
async function huggingFaceRequest(j:GenerationJob):Promise<ProviderStart>{const token=hfToken();if(!token)throw new Error('hf_token_missing');const client=new InferenceClient(token);const isVideo=j.type==='video'||j.type==='product_ad';if(isVideo){const out=await client.textToVideo({model:hfModelFor(j),inputs:j.prompt,provider:hfProvider() as any});return{providerJobId:`hf:${j.id}`,status:'completed',outputUrl:await hfOutputToUrl(out,'video/mp4')}}const out=await client.textToImage({model:hfModelFor(j),inputs:j.prompt,provider:hfProvider() as any});return{providerJobId:`hf:${j.id}`,status:'completed',outputUrl:await hfOutputToUrl(out,'image/png')}}
async function replicateStart(j:GenerationJob):Promise<ProviderStart>{const model=modelFor(j),p=model.split('/');if(p.length!==2)throw new Error('replicate_model_must_be_owner_slash_name');const body=await replicateRequest(`/v1/models/${encodeURIComponent(p[0])}/${encodeURIComponent(p[1])}/predictions`,{method:'POST',body:JSON.stringify({input:replicateInput(j)})});const s=String(body.status||'').toLowerCase();if(s==='succeeded')return{providerJobId:String(body.id),status:'completed',outputUrl:outputUrl(body.output)};if(s==='failed'||s==='canceled')throw new Error(`replicate_start_${s}:${body.error||''}`);return{providerJobId:String(body.id),status:'processing'};}
function configured(p:ProviderName){if(p==='runway')return!!runwayToken();if(p==='huggingface')return!!hfToken();if(p==='replicate')return!!replicateToken();return false;}
export function providerDiagnostics(){return{provider:primaryProvider(),fallback:fallbackProvider(),runwayTokenPresent:!!runwayToken(),runwayVideoModel:process.env.RUNWAY_VIDEO_MODEL?.trim()||'gen4.5',hfTokenPresent:!!hfToken(),replicateTokenPresent:!!replicateToken(),videoModel:modelFor({id:'',type:'video',prompt:'',quality:''}),imageModel:modelFor({id:'',type:'image',prompt:'',quality:''})};}
export function providerConfigured(){return configured(primaryProvider())||configured(fallbackProvider());}
async function startWith(p:ProviderName,j:GenerationJob){if(p==='runway')return runwayStart(j);if(p==='huggingface')return huggingFaceRequest(j);if(p==='replicate')return replicateStart(j);throw new Error(`provider_not_configured:${p}`);}
export async function startProvider(j:GenerationJob):Promise<ProviderStart>{const p=primaryProvider(),f=fallbackProvider();try{return await startWith(p,j)}catch(e){if(f!==p&&configured(f))return startWith(f,j);throw e;}}
export async function pollProvider(id:string):Promise<ProviderPoll>{if(id.startsWith('runway:'))return runwayPoll(id.slice(7));if(id.startsWith('hf:'))return{status:'failed',error:'huggingface_completed_job_should_not_be_polled'};const body=await replicateRequest(`/v1/predictions/${encodeURIComponent(id)}`);const s=String(body.status||'').toLowerCase();if(s==='succeeded')return{status:'completed',outputUrl:outputUrl(body.output)};if(s==='failed'||s==='canceled')return{status:'failed',error:String(body.error||s)};return{status:'processing'};}
