import { isOwner, denied, privateHeaders } from '../../../lib/auth.mjs';
import { readIndex } from '../../../lib/storage.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!await isOwner()) return denied();
  try { return Response.json(await readIndex(), { headers: privateHeaders }); }
  catch { return Response.json({ error: 'Recordings are temporarily unavailable. Please try again.' }, { status: 503, headers: privateHeaders }); }
}
