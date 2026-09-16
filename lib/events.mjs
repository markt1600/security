export const PREFIX = 'camera/v1/';
export const INDEX_PATH = `${PREFIX}latest.json`;
export const LIMIT = 10;
export function validId(id) { return typeof id === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(id); }
export function validMediaKind(kind) { return ['photo','clip'].includes(kind) || /^face-[1-4]$/.test(kind); }
export function mediaPath(id, kind) {
  if (!validId(id) || !validMediaKind(kind)) throw new Error('Invalid media path');
  return `${PREFIX}events/${id}/${kind === 'clip' ? 'clip.mp4' : `${kind}.jpg`}`;
}
export function eventMedia(event) { return ['photo','clip',...(event.faces || []).map(face=>face.id)]; }
export function eventChanged(previous, next) { return JSON.stringify(previous) !== JSON.stringify(next); }
export function validateEvent(value) {
  if (!value || !validId(value.id) || typeof value.detectedAt !== 'string' || !Number.isFinite(Date.parse(value.detectedAt))) throw new Error('Invalid event identity');
  if (!Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0 || value.durationSeconds > 600) throw new Error('Invalid clip duration');
  if (typeof value.camera !== 'string' || value.camera.length < 1 || value.camera.length > 80) throw new Error('Invalid camera name');
  const faceAnalysis = value.faceAnalysis ?? 'legacy';
  if (!['legacy','complete','failed'].includes(faceAnalysis)) throw new Error('Invalid face analysis state');
  const faces = value.faces ?? [];
  if (!Array.isArray(faces) || faces.length > 4 || (faces.length && faceAnalysis !== 'complete')) throw new Error('Invalid face highlights');
  const cleanFaces = faces.map(face => {
    if (!face || !/^face-[1-4]$/.test(face.id) || !Number.isFinite(face.atSeconds) || face.atSeconds < 0 || face.atSeconds > value.durationSeconds + .5 || !Number.isInteger(face.width) || !Number.isInteger(face.height) || Math.min(face.width,face.height) < 1 || Math.max(face.width,face.height) > 1000 || !Number.isFinite(face.confidence) || face.confidence < .8 || face.confidence > 1) throw new Error('Invalid face metadata');
    return {id:face.id,atSeconds:face.atSeconds,width:face.width,height:face.height,confidence:face.confidence};
  });
  if (new Set(cleanFaces.map(face=>face.id)).size !== cleanFaces.length) throw new Error('Duplicate face');
  const analysisVersion = value.analysisVersion ?? 0;
  if (!Number.isInteger(analysisVersion) || analysisVersion < 0 || analysisVersion > 100) throw new Error('Invalid analysis version');
  return { id: value.id, detectedAt: new Date(value.detectedAt).toISOString(), camera: value.camera, durationSeconds: value.durationSeconds, analysisVersion, faceAnalysis, faces:cleanFaces };
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
