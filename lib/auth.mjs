import { cookies } from 'next/headers';
import { COOKIE, verifySession } from './identity.mjs';
export async function isOwner() {
  const token = (await cookies()).get(COOKIE)?.value;
  return !!token && await verifySession(token);
}
export const privateHeaders = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' };
export function denied() { return Response.json({ error: 'Please sign in.' }, { status: 401, headers: privateHeaders }); }
