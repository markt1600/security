import { BlobPreconditionFailedError } from '@vercel/blob';
import { INDEX_PATH, LIMIT, mergeEvent, mediaPath, validateEvent, validateIndex, eventChanged } from '../lib/events.mjs';

// Upload files first. Publish the index LAST so readers never see half an event.
// The small index uses conditional writes to avoid losing another writer's update.
export async function publishEvent(storage, rawEvent, photo, clip, faceFiles = {}) {
  const event = validateEvent(rawEvent);
  let current = await storage.read();
  const previous = current.index.events.find(e => e.id === event.id);
  if (previous && !eventChanged(previous,event)) return current.index;
  if (current.index.events.length === LIMIT && Date.parse(event.detectedAt) < Date.parse(current.index.events.at(-1).detectedAt)) return current.index;
  // A backfill only adds face assets; existing full videos are immutable.
  if (!previous) {
    await storage.media(mediaPath(event.id, 'photo'), photo, 'image/jpeg');
    await storage.media(mediaPath(event.id, 'clip'), clip, 'video/mp4');
  }
  for (const face of event.faces) {
    if (!faceFiles[face.id]) throw new Error('Missing face crop');
    await storage.media(mediaPath(event.id,face.id),faceFiles[face.id],'image/jpeg');
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = mergeEvent(validateIndex(current.index), event);
    try { await storage.index(INDEX_PATH, next, current.etag); return next; }
    catch (err) {
      if (!(err instanceof BlobPreconditionFailedError) || attempt === 3) throw err;
      current = await storage.read();
    }
  }
}
