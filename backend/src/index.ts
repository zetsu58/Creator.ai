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
const users = new Map<string, { id: string; email?: string; plan: 'free'|'pro'|'business'; credits: number; deletedAt?: string }>();
const ledger: Array<{ id: string; userId: string; delta: number; reason: string; createdAt: string; ref?: string }> = [];
const jobs = new Map<string, any>();
const brandKits = new Map<string, any>();
const reports: any[] = [];
const purchases = new Map<string, any>();
const integrityEvents: any[] = [];

const ensureUser = (id: string) => {
  if (!users.has(id)) users.set(id, { id, plan: 'free', credits: 100 });
  const user = users.get(id)!;
  if (user.deletedAt) throw new Error('account_deleted');
  return user;
};

const bearer = (req: express.Request) => req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
const safeEqual = (a: string, b: string) => {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};

const adminGuard: express.RequestHandler = (req, res, next) => {
  const expected = process.env.VEYRA_ADMIN_TOKEN ?? '';
  const supplied = req.header('x-admin-token') ?? bearer(req);
  if (!expected || !safeEqual(expected, supplied)) return res.status(401).json({ error: 'unauthorized' });
  next();
};

function credit(userId: string, delta: number, reason: string, ref?: string) {
  const user = ensureUser(userId);
  user.credits += delta;
  ledger.push({ id: crypto.randomUUID(), userId, delta, reason, createdAt: new Date().toISOString(), ref });
  return user.credits;
}

function refundJob(job: any, reason = 'generation_refund') {
  if (job.refundedAt) return false;
  credit(job.userId, job.cost, reason, job.id);
  job.refundedAt = new Date().toISOString();
  job.status = 'refunded';
  return true;
}

const blockedPromptPatterns = [
  /sexual\s+minor/i,
  /child\s+sexual/i,
  /csam/i,
  /non[- ]?consensual\s+sexual/i,
  /terrorist\s+propaganda/i,
];

function moderatePrompt(prompt: string) {
  const blocked = blockedPromptPatterns.some((r) => r.test(prompt));
  return { allowed: !blocked, reason: blocked ? 'blocked_high_risk_content' : null };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'veyra-ai-backend',
    version: '0.4.0',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    providers: {
      primary: process.env.AI_PROVIDER_PRIMARY || 'mock',
      fallback: process.env.AI_PROVIDER_FALLBACK || 'mock'
    },
    capabilities: ['create','studio','copilot','business','projects','credits','admin','moderation','reports','purchases','integrity','account_deletion']
  });
});

app.get('/v1/legal', (_req, res) => {
  res.json({
    privacyUrl: process.env.VEYRA_PRIVACY_URL || 'https://example.invalid/veyra/privacy',
    termsUrl: process.env.VEYRA_TERMS_URL || 'https://example.invalid/veyra/terms',
    supportUrl: process.env.VEYRA_SUPPORT_URL || 'https://example.invalid/veyra/support',
    accountDeletionUrl: process.env.VEYRA_ACCOUNT_DELETION_URL || 'https://example.invalid/veyra/delete-account'
  });
});

app.get('/v1/users/:userId/wallet', (req, res) => {
  try {
    const user = ensureUser(req.params.userId);
    res.json({ userId: user.id, plan: user.plan, credits: user.credits });
  } catch {
    res.status(410).json({ error: 'account_deleted' });
  }
});

app.get('/v1/users/:userId/generations', (req, res) => {
  const items = [...jobs.values()]
    .filter(j => j.userId === req.params.userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ items });
});

app.delete('/v1/users/:userId', (req, res) => {
  const schema = z.object({ confirm: z.literal('DELETE') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'confirmation_required' });
  const user = users.get(req.params.userId) ?? { id: req.params.userId, plan: 'free' as const, credits: 0 };
  user.credits = 0;
  user.deletedAt = new Date().toISOString();
  users.set(req.params.userId, user);
  for (const job of jobs.values()) {
    if (job.userId === req.params.userId) {
      job.prompt = '[deleted]';
      job.references = [];
      job.output = null;
    }
  }
  res.json({ ok: true, deletedAt: user.deletedAt });
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

app.post('/v1/moderation/check', (req, res) => {
  const schema = z.object({ prompt: z.string().min(1).max(4000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  res.json(moderatePrompt(parsed.data.prompt));
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
  captions: z.boolean().optional().default(false),
  integrityToken: z.string().max(12000).optional()
});

app.post('/v1/generations', (req, res) => {
  const parsed = generationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  const body = parsed.data;
  const moderation = moderatePrompt(body.prompt);
  if (!moderation.allowed) return res.status(422).json({ error: 'prompt_blocked', reason: moderation.reason });

  let user;
  try { user = ensureUser(body.userId); } catch { return res.status(410).json({ error: 'account_deleted' }); }
  const cost = quoteCost(body);
  if (user.credits < cost) return res.status(402).json({ error: 'insufficient_credits', required: cost, available: user.credits });

  if (process.env.PLAY_INTEGRITY_REQUIRED === 'true' && !body.integrityToken) {
    return res.status(401).json({ error: 'integrity_token_required' });
  }

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

app.post('/v1/generations/:id/report', (req, res) => {
  const schema = z.object({ userId: z.string().min(2), reason: z.enum(['unsafe','sexual','violent','hate','copyright','identity','spam','other']), details: z.string().max(1000).optional().default('') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  const report = { id: crypto.randomUUID(), jobId: job.id, ...parsed.data, createdAt: new Date().toISOString(), status: 'open' };
  reports.push(report);
  res.status(201).json(report);
});

app.post('/v1/generations/:id/fail', adminGuard, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  job.status = 'failed';
  job.error = String(req.body?.error || 'provider_failed').slice(0, 500);
  const refunded = refundJob(job, 'automatic_generation_refund');
  res.json({ job, refunded });
});

app.post('/v1/copilot/plan', (req, res) => {
  const schema = z.object({ userId: z.string().min(2), message: z.string().min(2).max(2000), projectId: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const moderation = moderatePrompt(parsed.data.message);
  if (!moderation.allowed) return res.status(422).json({ error: 'prompt_blocked' });
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

app.post('/v1/integrity/google-play', (req, res) => {
  const schema = z.object({ userId: z.string().min(2), token: z.string().min(10).max(12000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const configured = Boolean(process.env.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON);
  const event = { id: crypto.randomUUID(), userId: parsed.data.userId, configured, createdAt: new Date().toISOString() };
  integrityEvents.push(event);
  if (!configured) return res.status(503).json({ error: 'play_integrity_not_configured', configured: false });
  return res.status(501).json({ error: 'play_integrity_remote_verification_pending', configured: true });
});

const purchaseSchema = z.object({
  userId: z.string().min(2),
  productId: z.string().min(2).max(200),
  transactionId: z.string().min(2).max(500),
  purchaseToken: z.string().min(2).max(12000),
  credits: z.number().int().min(1).max(1000000)
});

app.post('/v1/purchases/google/verify', (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) return res.status(503).json({ error: 'google_play_verification_not_configured' });
  if (purchases.has(parsed.data.transactionId)) return res.json(purchases.get(parsed.data.transactionId));
  return res.status(501).json({ error: 'google_play_remote_verification_pending' });
});

app.post('/v1/purchases/apple/verify', (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  if (!process.env.APPLE_IAP_ISSUER_ID || !process.env.APPLE_IAP_KEY_ID || !process.env.APPLE_IAP_PRIVATE_KEY) return res.status(503).json({ error: 'apple_iap_verification_not_configured' });
  if (purchases.has(parsed.data.transactionId)) return res.json(purchases.get(parsed.data.transactionId));
  return res.status(501).json({ error: 'apple_iap_remote_verification_pending' });
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
  if (!refundJob(job)) return res.status(409).json({ error: 'already_refunded' });
  const user = ensureUser(job.userId);
  res.json({ job, wallet: { credits: user.credits } });
});

app.get('/v1/admin/summary', adminGuard, (_req, res) => {
  const totalCredits = [...users.values()].reduce((sum, u) => sum + u.credits, 0);
  const queued = [...jobs.values()].filter(j => j.status === 'queued').length;
  const completed = [...jobs.values()].filter(j => j.status === 'completed').length;
  const failed = [...jobs.values()].filter(j => j.status === 'failed' || j.status === 'refunded').length;
  res.json({ users: users.size, jobs: jobs.size, queued, completed, failed, reportsOpen: reports.filter(r => r.status === 'open').length, purchases: purchases.size, ledgerEntries: ledger.length, creditsOutstanding: totalCredits });
});

app.get('/v1/admin/ledger', adminGuard, (_req, res) => res.json({ items: ledger.slice(-200).reverse() }));
app.get('/v1/admin/reports', adminGuard, (_req, res) => res.json({ items: reports.slice(-200).reverse() }));

app.use((_req, res) => res.status(404).json({ error: 'route_not_found' }));

const port = Number(process.env.PORT || 8080);
app.listen(port, '0.0.0.0', () => console.log(`Veyra AI backend listening on :${port}`));
