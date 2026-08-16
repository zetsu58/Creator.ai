const base = (process.env.VEYRA_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const userId = process.env.VEYRA_SMOKE_USER || 'veyra-smoke-user';

async function json(path, init) {
  const res = await fetch(`${base}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

console.log(`Veyra smoke test: ${base}`);
const health = await json('/health');
if (health.ok !== true) throw new Error('health not ok');
console.log('✓ health');

const store = await json('/v1/store/products');
if (!Array.isArray(store.items)) throw new Error('store products missing');
console.log(`✓ store products (${store.items.length})`);

const walletBefore = await json(`/v1/users/${userId}/wallet`);
console.log(`✓ wallet (${walletBefore.credits} credits)`);

const quote = await json('/v1/quote', {
  method: 'POST', headers: {'content-type':'application/json'},
  body: JSON.stringify({type:'image', quality:'fast', seconds:0, audio:false})
});
if (!(quote.credits > 0)) throw new Error('invalid quote');
console.log(`✓ quote (${quote.credits} credits)`);

const job = await json('/v1/generations', {
  method: 'POST', headers: {'content-type':'application/json'},
  body: JSON.stringify({userId, type:'image', prompt:'Minimal premium coffee campaign hero image', quality:'fast', aspectRatio:'1:1'})
});
if (!job.id) throw new Error('generation id missing');
console.log(`✓ generation queued (${job.id})`);

const fetched = await json(`/v1/generations/${job.id}`);
if (fetched.id !== job.id) throw new Error('generation lookup mismatch');
console.log('✓ generation lookup');

const walletAfter = await json(`/v1/users/${userId}/wallet`);
if (!(walletAfter.credits < walletBefore.credits)) throw new Error('credits were not reserved');
console.log(`✓ credit reservation (${walletBefore.credits} -> ${walletAfter.credits})`);

console.log('Veyra Cloud smoke test PASSED');
