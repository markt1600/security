import { createReadStream } from 'node:fs';
import { readFile, readdir, stat, realpath, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { get, put, list, del } from '@vercel/blob';
import { INDEX_PATH, PREFIX, LIMIT, validateIndex, validateEvent, mediaPath } from '../lib/events.mjs';
import { publishEvent } from './upload-core.mjs';

if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Set BLOB_READ_WRITE_TOKEN in .env.uploader (a dedicated PRIVATE store).');
if (!process.env.RECORDINGS_DIR) throw new Error('Set RECORDINGS_DIR in .env.uploader.');
const root = await realpath(process.env.RECORDINGS_DIR);
const lockPath = path.join(root, '.uploader.lock');
let lock;
try { lock = await open(lockPath, 'wx'); }
catch (err) {
  if (err.code !== 'EEXIST') throw err;
  const pid = Number(await readFile(lockPath, 'utf8'));
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid uploader lock. Check for a running uploader before removing it.');
  let alive = true;
  try { process.kill(pid, 0); } catch (check) { if (check.code === 'ESRCH') alive = false; }
  if (alive) throw new Error('An uploader is already running.');
  await unlink(lockPath);
  lock = await open(lockPath, 'wx');
}
await lock.writeFile(String(process.pid));
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; });

const storage = {
  async read() {
    const result = await get(INDEX_PATH, { access: 'private', useCache: false });
    if (!result) return { index: { version: 1, updatedAt: null, events: [] }, etag: null };
    if (result.statusCode !== 200) throw new Error('Could not read event index');
    return { index: validateIndex(await new Response(result.stream).json()), etag: result.blob.etag };
  },
  async media(name, file, contentType) {
    await put(name, createReadStream(file), { access: 'private', contentType, multipart: contentType === 'video/mp4', addRandomSuffix: false, allowOverwrite: true });
  },
  async index(name, value, etag) {
    await put(name, JSON.stringify(value), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: !!etag, ...(etag ? { ifMatch: etag } : {}), cacheControlMaxAge: 60 });
  },
};

async function insideRoot(file) {
  const actual = await realpath(file);
  const relative = path.relative(root, actual);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Recording path escapes RECORDINGS_DIR');
  return actual;
}
async function scan(directory = root, depth = 0) {
  if (depth > 3) return [];
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await scan(file, depth + 1));
    else if (entry.isFile() && entry.name.endsWith('.event.json')) {
      try {
        const safe = await insideRoot(file);
        if ((await stat(safe)).size > 16384) continue;
        const event = validateEvent(JSON.parse(await readFile(safe, 'utf8')));
        const base = safe.slice(0, -'.event.json'.length);
        const photo = await insideRoot(`${base}.jpg`);
        const clip = await insideRoot(`${base}.mp4`);
        const p = await stat(photo), c = await stat(clip);
        if (p.size < 3 || c.size < 12 || p.size > 20 * 1024 ** 2 || c.size > 500 * 1024 ** 2) throw new Error('Invalid media size');
        found.push({ event, photo, clip });
      } catch { console.warn(`Skipping incomplete or invalid event: ${entry.name}`); }
    }
  }
  return found;
}

// Only this uploader's media prefix is eligible. A 10-minute grace period keeps
// uploads in flight and recently replaced clips from being removed prematurely.
async function prune() {
  const { index } = await storage.read();
  const keep = new Set(index.events.flatMap(event => [mediaPath(event.id, 'photo'), mediaPath(event.id, 'clip')]));
  let cursor;
  do {
    const page = await list({ prefix: `${PREFIX}events/`, cursor, limit: 1000 });
    const old = page.blobs.filter(blob => !keep.has(blob.pathname) && Date.now() - new Date(blob.uploadedAt).getTime() > 600000);
    if (old.length) await del(old.map(blob => blob.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

let backoff = 5000;
let nextPrune = 0;
let lastPublishedSet = '';
console.log(`Watching ${root}. Only finalized .event.json bundles are uploaded; local files are retained.`);
try {
  do {
    try {
      const ready = (await scan()).sort((a,b) => Date.parse(b.event.detectedAt) - Date.parse(a.event.detectedAt)).slice(0, LIMIT).reverse();
      const signature = JSON.stringify(ready.map(item => item.event));
      // Idle local scans do not call Blob. Retry failures before advancing this marker.
      if (signature !== lastPublishedSet) {
        let current = (await storage.read()).index;
        for (const item of ready) {
          if (current.events.some(e => e.id === item.event.id)) continue;
          if (current.events.length === LIMIT && Date.parse(item.event.detectedAt) < Date.parse(current.events.at(-1).detectedAt)) continue;
          current = await publishEvent(storage, item.event, item.photo, item.clip);
          console.log(`Uploaded ${item.event.id}`);
        }
        lastPublishedSet = signature;
      }
      if (Date.now() > nextPrune) { await prune(); nextPrune = Date.now() + 300000; }
      backoff = 5000;
    } catch (error) {
      // Do not log SDK errors: they can contain credential-bearing URLs.
      console.error(`Upload unavailable (${error.name || 'Error'}). Local files are safe; retrying in ${Math.round(backoff / 1000)}s.`);
      if (process.argv.includes('--once')) { process.exitCode = 1; break; }
      await delay(backoff); backoff = Math.min(backoff * 2, 300000);
      continue;
    }
    if (process.argv.includes('--once')) break;
    await delay(5000);
  } while (!stopping);
} finally { await lock.close(); await unlink(lockPath); }
