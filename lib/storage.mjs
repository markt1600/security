import { get } from '@vercel/blob';
import { INDEX_PATH, validateIndex } from './events.mjs';
export async function readIndex() {
  const result = await get(INDEX_PATH, { access: 'private', useCache: false });
  if (!result) return { version: 1, updatedAt: null, events: [] };
  if (result.statusCode !== 200) throw new Error('Storage read failed');
  return validateIndex(await new Response(result.stream).json());
}
