import crypto from 'node:crypto';
import { z } from 'zod';

export const photoLabSchema = z.object({
  userId: z.string().min(2).max(128),
  assetUrl: z.string().url().max(2048),
  operation: z.enum(['smart_enhance','upscale','erase','face_preserve','restore']),
  preset: z.enum(['original','full_hd','2k','4k']).default('full_hd'),
  maskUrl: z.string().url().max(2048).optional(),
  strength: z.number().min(0).max(1).default(.65),
  preserveFace: z.boolean().default(true),
  stripMetadata: z.boolean().default(true),
});

export type PhotoLabInput = z.infer<typeof photoLabSchema>;
export type PhotoLabStatus = 'queued'|'processing'|'completed'|'failed'|'cancelled';

export interface PhotoLabJob {
  id: string;
  userId: string;
  status: PhotoLabStatus;
  input: PhotoLabInput;
  progress: number;
  stage: string;
  createdAt: string;
  updatedAt: string;
  outputUrl?: string;
  error?: string;
}

const jobs = new Map<string, PhotoLabJob>();

export function createPhotoLabJob(raw: unknown): PhotoLabJob {
  const input = photoLabSchema.parse(raw);
  if (input.operation === 'erase' && !input.maskUrl) throw new Error('mask_required');
  const now = new Date().toISOString();
  const job: PhotoLabJob = { id: crypto.randomUUID(), userId: input.userId, status: 'queued', input, progress: 0, stage: 'queued', createdAt: now, updatedAt: now };
  jobs.set(job.id, job);
  return job;
}

export function getPhotoLabJob(id: string) { return jobs.get(id); }

export function listPhotoLabJobs(userId: string) {
  return [...jobs.values()].filter(j => j.userId === userId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}

export function cancelPhotoLabJob(id: string, userId: string) {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return null;
  if (job.status === 'completed' || job.status === 'failed') return job;
  job.status = 'cancelled'; job.stage = 'cancelled'; job.updatedAt = new Date().toISOString();
  return job;
}

export interface PhotoModelAdapter {
  name: string;
  health(): Promise<boolean>;
  enhance(input: PhotoLabInput, onProgress: (progress:number, stage:string)=>void): Promise<string>;
}

export class RemoteGpuAdapter implements PhotoModelAdapter {
  name = 'remote-gpu';
  constructor(private baseUrl: string, private token = '') {}
  async health() {
    try { const r = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(5000) }); return r.ok; } catch { return false; }
  }
  async enhance(input: PhotoLabInput, onProgress: (progress:number, stage:string)=>void) {
    onProgress(10, 'uploading');
    const r = await fetch(`${this.baseUrl}/v1/process`, { method:'POST', headers:{'content-type':'application/json', ...(this.token ? {'authorization':`Bearer ${this.token}`} : {})}, body:JSON.stringify(input), signal:AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error(`gpu_worker_${r.status}`);
    const data = await r.json() as { outputUrl?: string };
    if (!data.outputUrl) throw new Error('gpu_worker_missing_output');
    onProgress(100, 'completed');
    return data.outputUrl;
  }
}

export async function runPhotoLabJob(id: string, adapter: PhotoModelAdapter) {
  const job = jobs.get(id); if (!job || job.status !== 'queued') return job;
  job.status = 'processing'; job.updatedAt = new Date().toISOString();
  try {
    job.outputUrl = await adapter.enhance(job.input, (progress, stage) => { job.progress = Math.max(0,Math.min(100,progress)); job.stage = stage; job.updatedAt = new Date().toISOString(); });
    job.status = 'completed'; job.progress = 100; job.stage = 'completed';
  } catch (e) { job.status = 'failed'; job.stage = 'failed'; job.error = e instanceof Error ? e.message : 'unknown_error'; }
  job.updatedAt = new Date().toISOString(); return job;
}
