import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import crypto from 'node:crypto';

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '2mb' }));

const startedAt = Date.now();
const users = new Map<string, { id: string; email?: string; plan: 'free'|'pro'|'business'; credits: number }>();
const ledger: Array<{ id: string; userId: string; delta: number; reason: string; createdAt: string }> = [];
const jobs = new Map<string, any>();

const ensureUser = (id: string) => {
  if (!users.has(id)) users.set(id, { id, plan: 'free', credits: 100 });
  return users.get(id)!;
};

const adminGuard: express.RequestHandler = (req, res, next) => {
  const expected = process.env.VEYRA_ADMIN_TOKEN;
  if (!expected || req.header('x-admin-token') !== expected) return res.status(401).json({ error: 'unauthorized' });
  next();
};

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'veyra-ai-backend',
    version: '0.1.0',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    providers: {
      primary: process.env.AI_PROVIDER_PRIMARY || 'mock',
      fallback: process.env.AI_PROVIDER_FALLBACK || 'mock'
    }
  });
});

app.get('/v1/users/:userId/wallet', (req, res) => {
  const user = ensureUser(req.params.userId);
  res.json({ userId: user.id, plan: user.plan, credits: user.credits });
});

const quoteSchema = z.object({
  type: z.enum(['image','video','product_ad','headshot','magic_edit']),
  seconds: z.number().int().min(1).max(60).optional().default(0),
  quality: z.enum(['fast','pro','cinematic']).optional().default('fast'),
  audio: z.boolean().optional().default(false)
});

function quoteCost(input: z.infer<typeof quoteSchema>) {
  if (input.type === 'image' || input.type === 'magic_edit') return input.quality === 'fast' ? 5 : 10;
  if (input.type === 'product_ad' || input.type === 'headshot') return input.quality === 'fast' ? 12 : 22;
  const perSecond = input.quality === 'fast' ? 5 : input.quality === 'pro' ? 8 : 12;
  return Math.max(20, input.seconds * perSecond + (input.audio ? 8 : 0));
}

app.post('/v1/quote', (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  res.json({ credits: quoteCost(parsed.data), currency: 'VEYRA_CREDIT' });
});

const generationSchema = z.object({
  userId: z.string().min(2),
  type: z.enum(['image','video','product_ad','headshot','magic_edit']),
  prompt: z.string().min(3).max(4000),
  seconds: z.number().int().min(1).max(60).optional().default(0),
  quality: z.enum(['fast','pro','cinematic']).optional().default('fast'),
  audio: z.boolean().optional().default(false),
  aspectRatio: z.enum(['9:16','16:9','1:1']).optional().default('9:16')
});

app.post('/v1/generations', (req, res) => {
  const parsed = generationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  const body = parsed.data;
  const user = ensureUser(body.userId);
  const cost = quoteCost(body);
  if (user.credits < cost) return res.status(402).json({ error: 'insufficient_credits', required: cost, available: user.credits });

  user.credits -= cost;
  const txId = crypto.randomUUID();
  ledger.push({ id: txId, userId: user.id, delta: -cost, reason: 'generation_reserved', createdAt: new Date().toISOString() });

  const id = crypto.randomUUID();
  const job = {
    id,
    userId: user.id,
    status: 'queued',
    type: body.type,
    prompt: body.prompt,
    quality: body.quality,
    seconds: body.seconds,
    aspectRatio: body.aspectRatio,
    audio: body.audio,
    cost,
    provider: process.env.AI_PROVIDER_PRIMARY || 'mock',
    createdAt: new Date().toISOString(),
    output: null
  };
  jobs.set(id, job);
  res.status(202).json(job);
});

app.get('/v1/generations/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  res.json(job);
});

app.post('/v1/generations/:id/mock-complete', adminGuard, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  job.status = 'completed';
  job.output = { kind: job.type, url: 'https://example.invalid/veyra/mock-output' };
  job.completedAt = new Date().toISOString();
  res.json(job);
});

app.post('/v1/generations/:id/refund', adminGuard, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  if (job.refundedAt) return res.status(409).json({ error: 'already_refunded' });
  const user = ensureUser(job.userId);
  user.credits += job.cost;
  ledger.push({ id: crypto.randomUUID(), userId: user.id, delta: job.cost, reason: 'generation_refund', createdAt: new Date().toISOString() });
  job.status = 'refunded';
  job.refundedAt = new Date().toISOString();
  res.json({ job, wallet: { credits: user.credits } });
});

app.get('/v1/admin/summary', adminGuard, (_req, res) => {
  const totalCredits = [...users.values()].reduce((sum, u) => sum + u.credits, 0);
  const queued = [...jobs.values()].filter(j => j.status === 'queued').length;
  const completed = [...jobs.values()].filter(j => j.status === 'completed').length;
  res.json({ users: users.size, jobs: jobs.size, queued, completed, ledgerEntries: ledger.length, creditsOutstanding: totalCredits });
});

app.get('/v1/admin/ledger', adminGuard, (_req, res) => res.json({ items: ledger.slice(-200).reverse() }));

app.use((_req, res) => res.status(404).json({ error: 'route_not_found' }));

const port = Number(process.env.PORT || 8080);
app.listen(port, '0.0.0.0', () => {
  console.log(`Veyra AI backend listening on :${port}`);
});
