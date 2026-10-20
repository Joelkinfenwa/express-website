// Server-side client for the Doorstep booking API (Express Pathology Booking API v1).
// Credentials stay on the server: DOORSTEP_CLIENT_ID, DOORSTEP_CLIENT_SECRET.
// DOORSTEP_API_BASE defaults to the sandbox so nothing reaches real nurses until it is changed.

const SANDBOX = 'https://api.devbookings.expresspathology.com.au';

export function doorstepConfigured() {
  return Boolean(process.env.DOORSTEP_CLIENT_ID && process.env.DOORSTEP_CLIENT_SECRET);
}

export function doorstepEnvironment() {
  const base = apiBase();
  return base === SANDBOX ? 'sandbox' : base.includes('devbookings') ? 'sandbox' : 'production';
}

function apiBase() {
  return (process.env.DOORSTEP_API_BASE || SANDBOX).replace(/\/$/, '');
}

let cached = null; // { token, expiresAt } — reused across warm invocations

async function accessToken() {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.DOORSTEP_CLIENT_ID,
    client_secret: process.env.DOORSTEP_CLIENT_SECRET
  });
  const r = await fetch(apiBase() + '/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!r.ok) throw new DoorstepError(r.status, 'AUTH_FAILED', 'Could not authenticate with the booking system');
  const j = await r.json();
  cached = { token: j.access_token, expiresAt: Date.now() + Math.max(60, (j.expires_in || 3600) - 60) * 1000 };
  return cached.token;
}

export class DoorstepError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function doorstep(path, { method = 'GET', query, body, headers = {} } = {}) {
  const url = new URL(apiBase() + path);
  if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const send = async (token) => fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  let r = await send(await accessToken());
  if (r.status === 401) { cached = null; r = await send(await accessToken()); } // token revoked or expired early
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!r.ok) {
    const e = (json && json.error) || {};
    throw new DoorstepError(r.status, e.code || 'UPSTREAM_ERROR', e.message || 'The booking system returned an error');
  }
  return { status: r.status, data: json };
}

export function sendError(res, err) {
  if (err instanceof DoorstepError) {
    const status = err.status >= 500 ? 502 : err.status;
    return res.status(status).json({ error: { code: err.code, message: err.message } });
  }
  console.error('doorstep proxy error:', err && err.message);
  return res.status(502).json({ error: { code: 'UPSTREAM_ERROR', message: 'The booking system is unavailable' } });
}

export function notConfigured(res) {
  return res.status(503).json({ error: { code: 'NOT_CONFIGURED', message: 'Live booking is not connected' } });
}
