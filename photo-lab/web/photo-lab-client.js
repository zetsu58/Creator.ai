export class PhotoLabClient {
 constructor(base=''){this.base=base.replace(/\/$/,'');}
 async json(url,options={}){const r=await fetch(this.base+url,options);let data={};try{data=await r.json()}catch{}if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);return data}
 async create(input){return this.json('/v1/photo-lab/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)})}
 async get(id){return this.json(`/v1/photo-lab/jobs/${encodeURIComponent(id)}`)}
 async cancel(id,userId){return this.json(`/v1/photo-lab/jobs/${encodeURIComponent(id)}/cancel`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId})})}
 async wait(id,{signal,onProgress=()=>{},interval=1000,timeout=240000}={}){const started=Date.now();for(;;){if(signal?.aborted)throw new DOMException('Aborted','AbortError');if(Date.now()-started>timeout)throw new Error('processing_timeout');const job=await this.get(id);onProgress(job);if(job.status==='completed')return job;if(['failed','cancelled'].includes(job.status))throw new Error(job.error||job.status);await new Promise((r,j)=>{const t=setTimeout(r,interval);signal?.addEventListener('abort',()=>{clearTimeout(t);j(new DOMException('Aborted','AbortError'))},{once:true})})}}
}
