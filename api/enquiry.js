import TESTS from '../lib/test-index.mjs';
import { stripe } from '../lib/stripe.js';
// Vercel serverless function: receives home visit requests, partner enquiries and contact messages.
// Delivery: email via Resend (RESEND_API_KEY + ENQUIRY_TO + ENQUIRY_FROM), which carries uploaded
// request forms as attachments. HubSpot Forms (HUBSPOT_PORTAL_ID + HUBSPOT_FORM_ID) also logs leads when set.

const FIELDS = ['company', 'partner_code', 'partner', 'submitter', 'patient_name', 'patient_dob', 'patient_phone', 'address', 'state', 'collection', 'kind', 'page', 'name', 'email', 'phone', 'suburb', 'postcode', 'preferred_date', 'preferred_time', 'has_referral', 'reference', 'payment', 'session_id', 'recommendation', 'organisation', 'organisation_type', 'monthly_volume', 'interest', 'topic', 'message'];
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
    { name: 'message', value: [d.message, d.organisation_type && `Type: ${d.organisation_type}`, d.monthly_volume && `Monthly orders: ${d.monthly_volume}`, d.interest && `Interested in: ${d.interest}`, d.topic && `Topic: ${d.topic}`, d.phone && `Phone: ${d.phone}`, d.suburb && `Suburb: ${d.suburb} ${d.postcode || ''}`, d.preferred_date && `Preferred: ${d.preferred_date} ${d.preferred_time || ''}`, d.has_referral && `Has referral: ${d.has_referral}`, d.reference && `Reference: ${d.reference}`, d.payment && `Payment: ${d.payment}`, `Form: ${d.kind}`].filter(Boolean).join('\n') }
  ];
  const url = `https://api.hsforms.com/submissions/v3/integration/submit/${process.env.HUBSPOT_PORTAL_ID}/${process.env.HUBSPOT_FORM_ID}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields, context: { pageUri: d.page || '' } }) });
  if (!r.ok) throw new Error(`HubSpot ${r.status}`);
}

const ATTACH_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'];
function attachment(body) {
  const a = body && body.attachment;
  if (!a || !a.content) return null;
  const type = String(a.contentType || '');
  if (!ATTACH_TYPES.includes(type)) return { error: 'Please upload a PDF, JPG or PNG' };
  if (String(a.content).length > 4.2 * 1024 * 1024) return { error: 'File too large' };
  const name = String(a.fileName || 'request-form').replace(/[^\w.\- ]+/g, '_').slice(0, 100);
  return { filename: name, content: String(a.content) };
}

async function toEmail(d, att) {
  const subject = d.kind === 'referral' ? `Partner referral (${d.company || d.partner}, invoice monthly): ${d.patient_name} (home visit)` : d.kind === 'partner' ? `Partner enquiry: ${d.organisation || d.name}` : d.kind === 'booking' ? 'Home visit request' + (d.reference ? ` ${d.reference}` : '') + ': ' + [d.suburb, d.postcode].filter(Boolean).join(' ') + (d.payment ? ` (${/Stripe|choose tests/i.test(d.payment) ? 'NOT PAID YET: sent to online payment, a separate paid-order email confirms payment' : 'payment to arrange'})` : '') : `Website enquiry: ${d.topic || 'General'}`;
  const rows = Object.entries(d).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#66706A">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`).join('');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.ENQUIRY_FROM, to: process.env.ENQUIRY_TO.split(',').map((s) => s.trim()), ...(d.email ? { reply_to: d.email } : {}), subject, html: `<table>${rows}</table>${att ? '<p>Request form attached.</p>' : ''}`, ...(att ? { attachments: [att] } : {}) })
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
}

// Test finder: send the patient their recommendation
async function toPatient(d, origin) {
  const recs = String(d.recommendation || '').split(',').map((h) => h.trim()).filter((h) => TESTS[h]).slice(0, 3)
    .map((h) => [TESTS[h].title, `/tests/${h}`, '$' + TESTS[h].price]);
  if (!recs.length) return;
  const first = escapeHtml((d.name || '').split(' ')[0]);
  const row = ([title, path, price], i) => `<tr><td style="padding:18px 20px;border-top:1px solid #DCE0D8"><div style="font-size:12px;font-weight:700;color:#A4502E;text-transform:uppercase;letter-spacing:.06em">${i === 0 ? 'Our recommendation' : 'Also consider'}</div><div style="font-size:20px;font-weight:700;margin:4px 0">${escapeHtml(title)}</div><div style="color:#4B5650">${escapeHtml(price)} · no referral needed</div><a href="${origin}${path}" style="display:inline-block;margin-top:10px;padding:10px 18px;border-radius:999px;background:${i === 0 ? '#17302A' : '#FFFFFF'};color:${i === 0 ? '#F7F4EF' : '#1C2420'};border:1px solid #17302A;text-decoration:none;font-weight:700">View test</a></td></tr>`;
  const html = `<div style="background:#F7F4EF;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1C2420"><table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:20px;border-collapse:separate;overflow:hidden"><tr><td style="padding:28px 20px 8px"><div style="font-size:20px;font-weight:700">express<span style="color:#F2A981">.</span> pathology</div><h1 style="font-size:26px;margin:20px 0 8px">Hi ${first || 'there'}, here is your recommended blood test</h1><p style="color:#4B5650;margin:0 0 12px">Based on your answers to our test finder. Collect at one of 2,000+ partner centres, or add a home visit and a registered nurse comes to you.</p></td></tr>${recs.map(row).join('')}<tr><td style="padding:20px;border-top:1px solid #DCE0D8;font-size:13px;color:#5A645E">This suggestion is based on your answers and is not medical advice. If you have symptoms or a health concern, please speak with your doctor. Reply to this email if you have any questions.</td></tr></table></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.ENQUIRY_FROM, to: [d.email], reply_to: process.env.ENQUIRY_TO.split(',')[0].trim(), subject: `Your recommended blood test: ${recs[0][0]}`, html })
  });
  if (!r.ok) throw new Error(`Resend patient ${r.status}`);
}

// A home visit booking with the patient's own doctor's form reaches the team only after payment.
// The order confirmation page sends the request details and form here; Stripe confirms the payment.
async function paidBooking(d, att, res) {
  if (!/^cs_(live|test)_\w+$/.test(d.session_id || '')) return res.status(400).json({ error: 'Invalid session' });
  if (!(process.env.RESEND_API_KEY && process.env.ENQUIRY_TO && process.env.ENQUIRY_FROM)) return res.status(500).json({ error: 'Email not configured' });
  try {
    const s = await stripe('GET', `/checkout/sessions/${d.session_id}?expand[]=payment_intent`);
    const m = s.metadata || {};
    if (s.payment_status !== 'paid' || !d.reference || (s.client_reference_id !== d.reference && m.reference !== d.reference)) return res.status(403).json({ error: 'Payment not confirmed' });
    const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
    if (pi && (pi.metadata || {}).form_sent) return res.status(200).json({ ok: true, duplicate: true });
    const order = pi && /^\d+$/.test((pi.metadata || {}).order_number || '') ? '#' + pi.metadata.order_number : d.reference;
    const name = d.name || [m.first_name, m.last_name].filter(Boolean).join(' ');
    const rows = [['Order', order], ['Checkout reference', d.reference], ['Name', name], ['Email', d.email], ['Phone', d.phone], ['Suburb', [d.suburb, d.postcode].filter(Boolean).join(' ')], ['Preferred date', d.preferred_date], ['Preferred time', d.preferred_time], ['Notes', d.message], ['Paid', new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format((s.amount_total || 0) / 100)]]
      .filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#66706A">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(String(v)).replace(/\n/g, '<br>')}</td></tr>`).join('');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: process.env.ENQUIRY_FROM, to: process.env.ENQUIRY_TO.split(',').map((x) => x.trim()), ...(d.email ? { reply_to: d.email } : {}),
        subject: `Doctor's request form for paid order ${order}: ${name}${d.suburb ? ', ' + d.suburb : ''}`,
        html: `<p><strong>Paid home visit with the patient's own request form.</strong> ${att ? 'Request form attached.' : 'The request form could not be carried over from the website. Ask the patient to reply with a photo of it.'}</p><table>${rows}</table>`,
        ...(att ? { attachments: [att] } : {}) })
    });
    if (!r.ok) throw new Error(`Resend ${r.status}`);
    if (pi) await stripe('POST', `/payment_intents/${pi.id}`, { metadata: { form_sent: '1' } }).catch(() => {});
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('paid booking failed:', e.message);
    return res.status(502).json({ error: 'Delivery failed' });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  if (body.company_website) return res.status(200).json({ ok: true }); // honeypot: silently accept bots
  const d = clean(body);
  const att = attachment(body);
  if (att && att.error) return res.status(400).json({ error: att.error });
  if (d.kind === 'booking-paid') return paidBooking(d, att, res);
  if (d.kind === 'referral') {
    // Partner referral (invoiced monthly): PARTNER_CODES = "Lifestrands (LSG)=code1;Other partner=code2"
    const codes = String(process.env.PARTNER_CODES || '').split(';').map((x) => x.split('=')).filter((x) => x.length === 2).map(([n, c]) => [n.trim(), c.trim()]);
    const norm = (x) => String(x || '').replace(/\s+/g, '').toUpperCase();
    const match = codes.find(([, c]) => c && norm(c) === norm(d.partner_code));
    if (!match) return res.status(403).json({ error: 'That partner access code is not recognised.' });
    if (!d.patient_name) return res.status(400).json({ error: 'Please enter the patient\'s full name.' });
    if (!att) return res.status(400).json({ error: 'Please attach the referral form.' });
    d.collection = 'Home visit';
    d.name = d.company || match[0];
    d.partner = match[0];
    delete d.partner_code;
  }
  if (d.kind !== 'referral' && (!d.name || !d.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))) return res.status(400).json({ error: 'Name and a valid email are required' });
  const emailReady = process.env.RESEND_API_KEY && process.env.ENQUIRY_TO && process.env.ENQUIRY_FROM;
  const hubspotReady = process.env.HUBSPOT_PORTAL_ID && process.env.HUBSPOT_FORM_ID;
  try {
    // Email first: it is the only route that carries an uploaded request form.
    if (emailReady) {
      await toEmail(d, att);
      if (d.kind === 'quiz') await toPatient(d, (process.env.SITE_URL || 'https://expresspathology.com.au').replace(/\/$/, '')).catch((e) => console.error('quiz email failed:', e.message));
    } else if (hubspotReady && !att) await toHubSpot(d);
    else throw new Error(att ? 'Attachment needs email delivery' : 'No delivery method configured');
    if (emailReady && hubspotReady) await toHubSpot(d).catch(() => {}); // also log the lead in HubSpot
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('enquiry delivery failed:', err.message);
    return res.status(502).json({ error: 'Delivery failed' });
  }
}
