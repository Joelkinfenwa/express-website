// Timed offer shown on the quiz result page: a fixed amount off one order of NOW_MIN or more,
// if checkout is started within NOW_MINUTES of the result. The deadline is signed here so it is
// enforced at checkout, not only by the countdown in the browser.
import crypto from 'node:crypto';

export const NOW_OFF = 25, NOW_MIN = 200, NOW_MINUTES = 15;
const GRACE_MS = 2 * 60e3; // time to finish the checkout form after the countdown ends
const key = () => crypto.createHash('sha256').update('ep-now:' + (process.env.ADMIN_SECRET || process.env.STRIPE_SECRET_KEY || '')).digest();
const sign = (x) => crypto.createHmac('sha256', key()).update(String(x)).digest('base64url').slice(0, 32);

export function mint() {
  const x = Date.now() + NOW_MINUTES * 60e3;
  return { x, s: sign(x), ttl: NOW_MINUTES * 60 };
}
export function valid(x, s) {
  x = Number(x); s = String(s || '');
  if (!x || !s) return false;
  const want = sign(x);
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return false;
  return x + GRACE_MS > Date.now();
}
