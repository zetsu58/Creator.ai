import test from 'node:test';
import assert from 'node:assert/strict';

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';

test('photo lab rejects erase without mask',async()=>{
 const r=await fetch(`${base}/v1/photo-lab/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'owner',assetUrl:'https://assets.example.test/a.jpg',operation:'erase',preset:'full_hd'})});
 assert.equal(r.status,400);
});

test('photo lab validates operation',async()=>{
 const r=await fetch(`${base}/v1/photo-lab/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'owner',assetUrl:'https://assets.example.test/a.jpg',operation:'invalid'})});
 assert.ok(r.status>=400&&r.status<500);
});
