import { isOwner, denied, privateHeaders } from '../../../lib/auth.mjs';
export const dynamic = 'force-dynamic';
export async function GET() { return await isOwner() ? Response.json({ ok: true }, { headers: privateHeaders }) : denied(); }
