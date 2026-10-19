// Vercel serverless function: receives partner and contact form submissions.
// Delivery: HubSpot Forms (if HUBSPOT_PORTAL_ID + HUBSPOT_FORM_ID are set),
// otherwise email via Resend (RESEND_API_KEY + ENQUIRY_TO + ENQUIRY_FROM).

const FIELDS = ['kind', 'page', 'name', 'email', 'phone', 'suburb', 'postcode', 'preferred_date', 'preferred_time', 'has_referral', 'organisation', 'organisation_type', 'monthly_volume', 'interest', 'topic', 'message'];
const MAX = 4000;

function clean(body) {
  const out = {};
  for (const k of FIELDS) {
    if (body[k] != null) out[k] = String(body[k]).slice(0, MAX).trim();
  }
  return out;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function toHubSpot(d) {
  const [first, ...rest] = (d.name || '').split(' ');
  const fields = [
    { name: 'email', value: d.email },
    { name: 'firstname', value: first || '' },
    { name: 'lastname', value: rest.join(' ') },
    { name: 'company', value: d.organisation || '' },
    { name: 'message', value: [d.message, d.organisation_type && `Type: ${d.organisation_type}`, d.monthly_volume && `Monthly orders: ${d.monthly_volume}`, d.interest && `Interested in: ${d.interest}`, d.topic && `Topic: ${d.topic}`, d.phone && `Phone: ${d.phone}`, d.suburb && `Suburb: ${d.suburb} ${d.postcode || ''}`, d.preferred_date && `Preferred: ${d.preferred_date} ${d.preferred_time || ''}`, d.has_referral && `Has referral: ${d.has_referral}`, `Form: ${d.kind}`].filter(Boolean).join('\n') }
  ];
  const url = `https://api.hsforms.com/submissions/v3/integration/submit/${process.env.HUBSPOT_PORTAL_ID}/${process.env.HUBSPOT_FORM_ID}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields, context: { pageUri: d.page || '' } }) });
  if (!r.ok) throw new Error(`HubSpot ${r.status}`);
}

async function toEmail(d) {
  const subject = d.kind === 'partner' ? `Partner enquiry: ${d.organisation || d.name}` : d.kind === 'booking' ? `Home visit request: ${d.suburb || ''} ${d.postcode || ''}`.trim() : `Website enquiry: ${d.topic || 'General'}`;
  const rows = Object.entries(d).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#66706A">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`).join('');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.ENQUIRY_FROM, to: process.env.ENQUIRY_TO.split(',').map((s) => s.trim()), reply_to: d.email, subject, html: `<table>${rows}</table>` })
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  if (body.company_website) return res.status(200).json({ ok: true }); // honeypot: silently accept bots
  const d = clean(body);
  if (!d.name || !d.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return res.status(400).json({ error: 'Name and a valid email are required' });
  try {
    if (process.env.HUBSPOT_PORTAL_ID && process.env.HUBSPOT_FORM_ID) await toHubSpot(d);
    else if (process.env.RESEND_API_KEY && process.env.ENQUIRY_TO && process.env.ENQUIRY_FROM) await toEmail(d);
    else throw new Error('No delivery method configured');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('enquiry delivery failed:', err.message);
    return res.status(502).json({ error: 'Delivery failed' });
  }
}
