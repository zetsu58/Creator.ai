import { Router } from 'express';
import { z } from 'zod';
import { cancelPhotoLabJob, createPhotoLabJob, getPhotoLabJob, listPhotoLabJobs, RemoteGpuAdapter, runPhotoLabJob } from './photo_lab.js';

export const photoLabRouter=Router();
const worker=new RemoteGpuAdapter(process.env.PHOTO_LAB_WORKER_URL||'http://127.0.0.1:8080',process.env.PHOTO_LAB_WORKER_TOKEN||'');
const owner=(req:any)=>String(req.header('x-photo-owner')||'');

photoLabRouter.get('/health',async(_req,res)=>res.json({ok:true,worker:await worker.health()}));
photoLabRouter.post('/jobs',(req,res)=>{try{const who=owner(req);if(!who||who!==req.body?.userId)return res.status(401).json({error:'unauthorized'});const job=createPhotoLabJob(req.body);res.status(202).json(job);queueMicrotask(()=>void runPhotoLabJob(job.id,worker));}catch(e){const m=e instanceof Error?e.message:'invalid_request';res.status(m==='mask_required'?400:422).json({error:m})}});
photoLabRouter.get('/jobs/:id',(req,res)=>{const j=getPhotoLabJob(req.params.id);if(!j||j.userId!==owner(req))return res.status(404).json({error:'not_found'});res.json(j)});
photoLabRouter.get('/users/:userId/jobs',(req,res)=>{if(owner(req)!==req.params.userId)return res.status(401).json({error:'unauthorized'});res.json({items:listPhotoLabJobs(req.params.userId)})});
photoLabRouter.post('/jobs/:id/cancel',(req,res)=>{const p=z.object({userId:z.string().min(2)}).safeParse(req.body);if(!p.success||owner(req)!==p.data.userId)return res.status(401).json({error:'unauthorized'});const j=cancelPhotoLabJob(req.params.id,p.data.userId);return j?res.json(j):res.status(404).json({error:'not_found'})});
