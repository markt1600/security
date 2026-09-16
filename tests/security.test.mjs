import { BlobPreconditionFailedError } from '@vercel/blob';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySession, OWNER } from '../lib/identity.mjs';
import { validateEvent, validateIndex, mergeEvent, validId, validRange } from '../lib/events.mjs';
import { publishEvent } from '../scripts/upload-core.mjs';

process.env.SECURITY_SSO_SECRET = 'test-only-not-a-deployment-secret-123456789';
function sign(scope, expires = Date.now() + 60000) {
  const payload = `${Buffer.from(scope).toString('base64url')}.${expires}`;
  return `${payload}.${createHmac('sha256', process.env.SECURITY_SSO_SECRET).update(payload).digest('base64url')}`;
}
const event = n => ({ id: `event_${String(n).padStart(3,'0')}`, detectedAt: new Date(Date.UTC(2026,8,16,0,n)).toISOString(), durationSeconds: 15, camera: 'C922' });
test('accepts only the signed camera scope for the exact owner', () => {
  assert.equal(verifySession(sign(`camera:${OWNER}`)), true);
  for (const scope of [OWNER, `specials:${OWNER}`, 'camera:someone@gmail.com']) assert.equal(verifySession(sign(scope)), false);
  assert.equal(verifySession(sign(`camera:${OWNER}`, Date.now() - 1)), false);
  assert.equal(verifySession(sign(`camera:${OWNER}`) + 'x'), false);
  assert.equal(verifySession('bad'), false);
});
test('missing or changed secret fails closed', () => {
  const old = process.env.SECURITY_SSO_SECRET; const token = sign(`camera:${OWNER}`);
  process.env.SECURITY_SSO_SECRET = ''; assert.equal(verifySession(token), false);
  process.env.SECURITY_SSO_SECRET = old + 'rotated'; assert.equal(verifySession(token), false);
  process.env.SECURITY_SSO_SECRET = old;
});
test('only latest ten remain, ordered by detection time; retries do not duplicate', () => {
  let index = { version: 1, events: [] };
  for (let n = 0; n < 15; n++) index = mergeEvent(index, event(n));
  index = mergeEvent(index, event(14));
  assert.equal(index.events.length, 10);
  assert.equal(index.events[0].id, 'event_014');
  assert.equal(index.events.at(-1).id, 'event_005');
});
test('rejects path traversal, malformed metadata and multipart ranges', () => {
  for (const id of ['../secret', 'https://x', 'a/bbbbbbb', '']) assert.equal(validId(id), false);
  assert.throws(() => validateEvent({ ...event(0), detectedAt: 'bad' }));
  assert.throws(() => validateEvent({ ...event(0), durationSeconds: -1 }));
  assert.throws(() => validateIndex({version:1, events:[event(0), event(0)]}));
  for (const range of [null, 'bytes=0-', 'bytes=100-200', 'bytes=-500']) assert.equal(validRange(range), true);
  for (const range of ['bytes=0-1,2-3', 'bytes=x-y', 'foo']) assert.equal(validRange(range), false);
});
test('publishes metadata only after BOTH files complete', async () => {
  const calls = [];
  const storage = { read: async () => ({ index:{ version:1, events:[] }, etag:null }), media:async name => calls.push(name), index:async () => calls.push('index') };
  await publishEvent(storage, event(0), 'photo', 'clip');
  assert.deepEqual(calls.map(s => s.split('/').at(-1)), ['photo.jpg', 'clip.mp4', 'index']);
  calls.length = 0;
  storage.media = async () => { throw new Error('offline'); };
  await assert.rejects(publishEvent(storage, event(0), 'photo', 'clip'));
  assert.deepEqual(calls, []);
});
test('conditional-write conflict rereads and preserves concurrent events', async () => {
  let reads = 0, writes = 0, saved;
  const storage = {
    read: async () => ({ index:{version:1, events:reads++ ? [event(1)] : []}, etag:String(reads) }),
    media:async () => {},
    index:async (_path, value) => { if (!writes++) { throw new BlobPreconditionFailedError(); } saved=value; },
  };
  await publishEvent(storage, event(2), 'photo', 'clip');
  assert.deepEqual(saved.events.map(e => e.id), ['event_002','event_001']);
});
