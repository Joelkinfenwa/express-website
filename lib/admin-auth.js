// Sign-in for the internal orders tracker (/admin). Access is by emailed link; the token is an HMAC
// over the email and an expiry, keyed from ADMIN_SECRET (or, if unset, derived from the Stripe key).
import crypto from 'node:crypto';

const DAYS = 30;
const key = () => crypto.createHash('sha256').update('ep-admin:' + (process.env.ADMIN_SECRET || process.env.STRIPE_SECRET_KEY || '')).digest();
const b64 = (s) => Buffer.from(s).toString('base64url');

export function allowedEmails() {
  return String(process.env.ADMIN_EMAILS || 'express@expresspathology.com.au').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}

export function signToken(email) {
  const body = b64(`${email.toLowerCase()}|${Date.now() + DAYS * 864e5}`);
  return `${body}.${crypto.createHmac('sha256', key()).update(body).digest('base64url')}`;
}

export function verify(req) {
  const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [body, sig] = t.split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', key()).update(body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const [email, exp] = Buffer.from(body, 'base64url').toString().split('|');
  if (!email || Number(exp) < Date.now() || !allowedEmails().includes(email)) return null;
  return email;
}
