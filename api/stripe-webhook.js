// Stripe webhook: on a paid Checkout Session, emails the order to the Express team and a
// confirmation to the patient (via Resend). Configure in Stripe with the event
// checkout.session.completed (and checkout.session.async_payment_succeeded), and set
// STRIPE_WEBHOOK_SECRET in Vercel.
import { verifySignature } from '../lib/stripe.js';

export const config = { api: { bodyParser: false } };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => '$' + (c / 100).toFixed(2).replace(/\.00$/, '');

// Read the raw request stream before anything touches req.body (Vercel parses req.body lazily,
// which would consume the stream and break signature verification).
async function rawBody(req) {
  const chunks = [];
  if (typeof req[Symbol.asyncIterator] === 'function') for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return '';
}

async function send(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
}

function nextSteps(m) {
  if (m.order_type === 'own-form') return ['Our team will contact you to confirm your appointment time with a registered nurse.', 'Have your doctor\'s request form and photo ID ready for the visit.'];
  if (/^Home/.test(m.collection)) return ['We will email your pathology request form.', 'Our team will contact you to confirm a time for your registered nurse to visit.', 'Check how to prepare: https://expresspathology.com.au/prepare'];
  return ['We will email your pathology request form.', 'Take it to any partner collection centre: https://expresspathology.com.au/collection-centres', 'Check how to prepare: https://expresspathology.com.au/prepare'];
}

export function emails(s) {
  const m = s.metadata || {};
  const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
  const total = money(s.amount_total || 0);
  const items = String(m.items || '').split('; ').filter(Boolean);
  const rows = [
    ['Reference', m.reference], ['Order', items.join(', ')], ['Total paid', total], ['Collection', m.collection],
    ['Name', name], ['Date of birth', m.dob], ['Sex', m.sex], ['Email', s.customer_details && s.customer_details.email || s.customer_email],
    ['Phone', m.phone], ['Address', [m.address, m.suburb, m.state, m.postcode].filter(Boolean).join(', ')],
    ['Preferred date', m.preferred_date], ['Preferred time', m.preferred_time], ['Notes', m.notes], ['Stripe session', s.id]
  ].filter(([, v]) => v);
  const team = {
    from: process.env.ENQUIRY_FROM,
    to: String(process.env.ENQUIRY_TO || '').split(',').map((x) => x.trim()).filter(Boolean),
    reply_to: s.customer_details && s.customer_details.email || s.customer_email,
    subject: `New paid order ${m.reference}: ${items[0] || 'Order'}${items.length > 1 ? ` + ${items.length - 1} more` : ''} (${m.collection})`,
    html: `<p><strong>New paid order.</strong> ${m.order_type === 'own-form' ? 'Patient has their own request form (sent separately with the same reference). Book the nurse.' : 'Issue the pathology request form' + (/^Home/.test(m.collection) ? ' and book the nurse.' : '.')}</p><table>${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5A645E">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>`
  };
  const steps = nextSteps(m);
  const patient = {
    from: process.env.ENQUIRY_FROM,
    to: [s.customer_details && s.customer_details.email || s.customer_email],
    reply_to: String(process.env.ENQUIRY_TO || '').split(',')[0].trim(),
    subject: `Your Express Pathology order ${m.reference}`,
    html: `<div style="background:#F7F4EF;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1C2420"><table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:20px;border-collapse:separate"><tr><td style="padding:28px 24px 8px"><div style="font-size:20px;font-weight:700">express<span style="color:#F2A981">.</span> pathology</div><h1 style="font-size:24px;margin:20px 0 6px">Thank you, ${esc(m.first_name || 'there')}. Your order is confirmed.</h1><p style="color:#4B5650;margin:0">Reference <strong>${esc(m.reference)}</strong></p></td></tr><tr><td style="padding:16px 24px"><table width="100%" style="border-top:1px solid #DCE0D8">${items.map((i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #DCE0D8">${esc(i)}</td></tr>`).join('')}<tr><td style="padding:12px 0;font-weight:700">Total paid: ${esc(total)}</td></tr></table></td></tr><tr><td style="padding:8px 24px 16px"><h2 style="font-size:18px;margin:0 0 8px">What happens next</h2><ol style="margin:0;padding-left:20px;color:#2E3833">${steps.map((x) => `<li style="margin-bottom:8px">${esc(x)}</li>`).join('')}</ol></td></tr><tr><td style="padding:16px 24px 28px;border-top:1px solid #DCE0D8;font-size:13px;color:#5A645E">Questions? Reply to this email or call 02 9545 2940. Results are reviewed by an Australian doctor and are not a diagnosis. Always speak with your doctor about your health.</td></tr></table></div>`
  };
  return { team, patient };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const raw = await rawBody(req);
  if (!verifySignature(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).json({ error: 'Invalid signature' });
  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Invalid payload' }); }
  const s = event.data && event.data.object;
  const relevant = (event.type === 'checkout.session.completed' && s.payment_status === 'paid') || event.type === 'checkout.session.async_payment_succeeded';
  if (!relevant) return res.status(200).json({ received: true, ignored: event.type });
  if (!process.env.RESEND_API_KEY || !process.env.ENQUIRY_FROM || !process.env.ENQUIRY_TO) { console.error('order email not configured'); return res.status(500).json({ error: 'Email not configured' }); }
  try {
    const { team, patient } = emails(s);
    await send(team);
    if (patient.to[0]) await send(patient).catch((e) => console.error('patient email failed:', e.message));
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('order email failed:', e.message);
    return res.status(500).json({ error: 'Email failed' }); // Stripe will retry
  }
}
