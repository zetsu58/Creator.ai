import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import crypto from 'node:crypto';

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '4mb' }));

const startedAt = Date.now();
const users = new Map<string, { id: string; email?: string; plan: 'free'|'pro'|'business'; credits: number }>();
const ledger: Array<{ id: string; userId: string; delta: number; reason: string; createdAt: string }> = [];
const jobs = new Map<string, any>();
const brandKits = new Map<string, any>();

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
    version: '0.3.0',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    providers: {
      primary: process.env.AI_PROVIDER_PRIMARY || 'mock',
      fallback: process.env.AI_PROVIDER_FALLBACK || 'mock'
    },
    capabilities: ['create','studio','copilot','business','projects','credits','admin']
  });
});

app.get('/v1/users/:userId/wallet', (req, res) => {
  const user = ensureUser(req.params.userId);
  res.json({ userId: user.id, plan: user.plan, credits: user.credits });
});

app.get('/v1/users/:userId/generations', (req, res) => {
  const items = [...jobs.values()]
    .filter(j => j.userId === req.params.userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ items });
});

const quoteSchema = z.object({
  type: z.enum(['image','video','product_ad','headshot','magic_edit']),
  seconds: z.number().int().min(0).max(60).optional().default(0),
  quality: z.enum(['fast','pro','cinematic']).optional().default('fast'),
  audio: z.boolean().optional().default(false),
  draft: z.boolean().optional().default(false)
});

function quoteCost(input: z.infer<typeof quoteSchema>) {
  if (input.type === 'image' || input.type === 'magic_edit') return input.quality === 'fast' ? 5 : 10;
  if (input.type === 'product_ad' || input.type === 'headshot') return input.quality === 'fast' ? 12 : 22;
  const perSecond = input.quality === 'fast' ? 5 : input.quality === 'pro' ? 8 : 12;
  const normal = Math.max(20, input.seconds * perSecond + (input.audio ? 8 : 0));
  return input.draft ? Math.max(8, Math.ceil(normal * .35)) : normal;
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
  seconds: z.number().int().min(0).max(60).optional().default(0),
  quality: z.enum(['fast','pro','cinematic']).optional().default('fast'),
  audio: z.boolean().optional().default(false),
  aspectRatio: z.enum(['9:16','16:9','1:1','4:5']).optional().default('9:16'),
  draft: z.boolean().optional().default(false),
  references: z.array(z.string().max(300)).max(8).optional().default([]),
  brandKit: z.boolean().optional().default(false),
  captions: z.boolean().optional().default(false)
});

app.post('/v1/generations', (req, res) => {
  const parsed = generationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  const body = parsed.data;
  const user = ensureUser(body.userId);
  const cost = quoteCost(body);
  if (user.credits < cost) return res.status(402).json({ error: 'insufficient_credits', required: cost, available: user.credits });

  user.credits -= cost;
  ledger.push({ id: crypto.randomUUID(), userId: user.id, delta: -cost, reason: 'generation_reserved', createdAt: new Date().toISOString() });

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
    draft: body.draft,
    references: body.references,
    brandKit: body.brandKit,
    captions: body.captions,
    cost,
    provider: process.env.AI_PROVIDER_PRIMARY || 'mock',
    createdAt: new Date().toISOString(),
    output: null,
    versions: []
  };
  jobs.set(id, job);
  res.status(202).json(job);
});

app.get('/v1/generations/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  res.json(job);
});

app.post('/v1/copilot/plan', (req, res) => {
  const schema = z.object({ userId: z.string().min(2), message: z.string().min(2).max(2000), projectId: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  ensureUser(parsed.data.userId);
  const m = parsed.data.message;
  res.json({
    ok: true,
    projectId: parsed.data.projectId ?? null,
    plan: [
      `Interpret request: ${m.slice(0, 120)}`,
      'Lock subject/product identity and brand constraints',
      'Prepare scene/visual plan',
      'Route to best available provider',
      'Quality-check result and prepare repair if needed'
    ],
    suggestions: ['Make it more cinematic','Create 4 variations','Resize for social','Add captions and voice-over']
  });
});

app.get('/v1/business/:userId/brand-kit', (req, res) => {
  const kit = brandKits.get(req.params.userId) ?? { name: 'My Brand', colors: ['#8B5CF6','#55D6FF'], slogan: '', logoUrl: null };
  res.json(kit);
});

app.put('/v1/business/:userId/brand-kit', (req, res) => {
  const schema = z.object({ name: z.string().min(1).max(80), colors: z.array(z.string()).min(1).max(6), slogan: z.string().max(160).optional().default('') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  ensureUser(req.params.userId);
  const kit = { ...parsed.data, updatedAt: new Date().toISOString() };
  brandKits.set(req.params.userId, kit);
  res.json(kit);
});

app.post('/v1/business/batch', (req, res) => {
  const schema = z.object({ userId: z.string().min(2), count: z.number().int().min(1).max(100), operation: z.enum(['background','enhance','product_ad','resize']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  ensureUser(parsed.data.userId);
  res.status(202).json({ id: crypto.randomUUID(), status: 'queued', ...parsed.data, createdAt: new Date().toISOString() });
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
app.listen(port, '0.0.0.0', () => console.log(`Veyra AI backend listening on :${port}`));
