import { INDEX_PATH, LIMIT, mergeEvent, mediaPath, validateEvent, validateIndex } from '../lib/events.mjs';

// Upload files first. Publish the index LAST so readers never see half an event.
// The small index uses conditional writes to avoid losing another writer's update.
export async function publishEvent(storage, rawEvent, photo, clip) {
  const event = validateEvent(rawEvent);
  let current = await storage.read();
  if (current.index.events.some(e => e.id === event.id)) return current.index;
  if (current.index.events.length === LIMIT && Date.parse(event.detectedAt) < Date.parse(current.index.events.at(-1).detectedAt)) return current.index;
  await storage.media(mediaPath(event.id, 'photo'), photo, 'image/jpeg');
  await storage.media(mediaPath(event.id, 'clip'), clip, 'video/mp4');
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = mergeEvent(validateIndex(current.index), event);
    try { await storage.index(INDEX_PATH, next, current.etag); return next; }
    catch (err) {
      if (err.name !== 'BlobPreconditionFailedError' || attempt === 3) throw err;
      current = await storage.read();
    }
  }
}
