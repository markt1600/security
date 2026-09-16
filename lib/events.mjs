export const PREFIX = 'camera/v1/';
export const INDEX_PATH = `${PREFIX}latest.json`;
export const LIMIT = 10;
export function validId(id) { return typeof id === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(id); }
export function mediaPath(id, kind) { return `${PREFIX}events/${id}/${kind === 'photo' ? 'photo.jpg' : 'clip.mp4'}`; }
export function validateEvent(value) {
  if (!value || !validId(value.id) || typeof value.detectedAt !== 'string' || !Number.isFinite(Date.parse(value.detectedAt))) throw new Error('Invalid event identity');
  if (!Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0 || value.durationSeconds > 600) throw new Error('Invalid clip duration');
  if (typeof value.camera !== 'string' || value.camera.length < 1 || value.camera.length > 80) throw new Error('Invalid camera name');
  return { id: value.id, detectedAt: new Date(value.detectedAt).toISOString(), camera: value.camera, durationSeconds: value.durationSeconds };
}
export function validateIndex(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.events) || value.events.length > LIMIT) throw new Error('Invalid event index');
  const events = value.events.map(validateEvent);
  if (new Set(events.map(e => e.id)).size !== events.length) throw new Error('Duplicate event');
  return { version: 1, updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null, events: events.sort((a,b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt)) };
}
export function mergeEvent(index, event) {
  return validateIndex({ version: 1, updatedAt: new Date().toISOString(), events: [...index.events.filter(e => e.id !== event.id), validateEvent(event)].sort((a,b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt)).slice(0, LIMIT) });
}
export function validRange(value) { return value === null || /^bytes=(?:\d+-\d*|-\d+)$/.test(value); }
