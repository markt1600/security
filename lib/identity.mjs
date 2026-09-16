import { createHmac, timingSafeEqual } from 'node:crypto';
export const OWNER = 'markh.tan@gmail.com';
export const COOKIE = '__Secure-mt_camera';
const SCOPE = `camera:${OWNER}`;

// Separate key and scope: magazine cookies and dashboard tokens cannot unlock footage.
export function verifySession(token, now = Date.now()) {
  const secret = process.env.SECURITY_SSO_SECRET;
  if (!secret || secret.length < 32 || typeof token !== 'string' || token.length > 1024) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[1])) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const got = Buffer.from(parts[2]);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  return Number(parts[1]) > now && Buffer.from(parts[0], 'base64url').toString() === SCOPE;
}
