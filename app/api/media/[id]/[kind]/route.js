import { head } from '@vercel/blob';
import { isOwner, denied, privateHeaders } from '../../../../../lib/auth.mjs';
import { readIndex } from '../../../../../lib/storage.mjs';
import { mediaPath, validId, validRange, validMediaKind, eventMedia } from '../../../../../lib/events.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request, context) {
  if (!await isOwner()) return denied();
  const { id, kind } = await context.params;
  if (!validId(id) || !validMediaKind(kind)) return new Response(null, { status: 404, headers: privateHeaders });
  const range = request.headers.get('range');
  if (!validRange(range)) return new Response(null, { status: 416, headers: privateHeaders });
  try {
    const index = await readIndex();
    const event = index.events.find(event => event.id === id);
    if (!event || !eventMedia(event).includes(kind)) return new Response(null, { status: 404, headers: privateHeaders });
    const blob = await head(mediaPath(id, kind));
    const url = new URL(blob.url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.private.blob.vercel-storage.com')) throw new Error('Private storage required');
    // Only server-resolved Blob URLs are fetched. No caller-supplied URL or pathname.
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`, ...(range ? { Range: range } : {}) },
      cache: 'no-store', redirect: 'error', signal: request.signal,
    });
    if (![200, 206, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status === 404 ? 404 : 502, headers: privateHeaders });
    }
    const headers = new Headers(privateHeaders);
    headers.set('Content-Type', kind === 'clip' ? 'video/mp4' : 'image/jpeg');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Disposition', `inline; filename="${id}-${kind}.${kind === 'clip' ? 'mp4' : 'jpg'}"`);
    for (const name of ['content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name); if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch { return Response.json({ error: 'This recording is unavailable. Refresh to load recent detections.' }, { status: 503, headers: privateHeaders }); }
}
