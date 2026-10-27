// Stripe webhook: on a paid Checkout Session, emails the order to the Express team and a
// confirmation to the patient (via Resend). Configure in Stripe with the event
// checkout.session.completed (and checkout.session.async_payment_succeeded), and set
// STRIPE_WEBHOOK_SECRET in Vercel.
import { verifySignature } from '../lib/stripe.js';
import PRICES from '../lib/price-index.mjs';
import { requestFormPdf, orderFromSession } from '../lib/request-form.js';
import { patientEmail } from '../lib/patient-email.js';
import { orderNumber } from '../lib/order-number.js';

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

// The pathology request form for panel and Build Your Own orders (not for own-form home visits).
export async function requestForm(s) {
  const m = s.metadata || {};
  if (m.order_type !== 'panel' && m.order_type !== 'builder') return null;
  const order = orderFromSession(s, PRICES);
  if (!order.items.length) throw new Error('no tests found for ' + m.reference);
  const bytes = await requestFormPdf(order);
  return { filename: `Pathology request form ${String(m.reference).replace('#', 'order ')}.pdf`, content: Buffer.from(bytes).toString('base64') };
}

export function emails(s, form = null, formError = '') {
  const m = s.metadata || {};
  const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
  const total = money(s.amount_total || 0);
  const items = String(m.items || '').split('; ').filter(Boolean);
  const rows = [
    ['Order', m.reference], ['Checkout reference', m.checkout_ref !== m.reference ? m.checkout_ref : ''], ['Items', items.join(', ')], ['Total paid', total], ['Collection', m.collection],
    ['Name', name], ['Date of birth', m.dob], ['Sex', m.sex], ['Email', s.customer_details && s.customer_details.email || s.customer_email],
    ['Phone', m.phone], ['Address', [m.address, m.suburb, m.state, m.postcode].filter(Boolean).join(', ')],
    ['Preferred date', m.preferred_date], ['Preferred time', m.preferred_time], ['Notes', m.notes], ['Stripe session', s.id]
  ].filter(([, v]) => v);
  const toPatient = !!form; // the request form is always attached to the patient's confirmation email
  const team = {
    from: process.env.ENQUIRY_FROM,
    to: String(process.env.ENQUIRY_TO || '').split(',').map((x) => x.trim()).filter(Boolean),
    reply_to: s.customer_details && s.customer_details.email || s.customer_email,
    ...(form ? { attachments: [form] } : {}),
    subject: `New paid order ${m.reference}: ${items[0] || 'Order'}${items.length > 1 ? ` + ${items.length - 1} more` : ''} (${m.collection})`,
    html: `<p><strong>New paid order.</strong> ${m.order_type === 'own-form' ? 'Patient has their own doctor\'s request form. It follows in a separate email titled "Doctor\'s request form for paid order". If it has not arrived within a few minutes, ask the patient to reply with a photo of it. Book the nurse.' : (form ? `Pathology request form attached${toPatient ? ' (also emailed to the patient)' : '. Send it to the patient'}` : `Request form could not be generated${formError ? ' (' + esc(formError) + ')' : ''}. Issue it manually`) + (/^Home/.test(m.collection) ? ' and book the nurse.' : '.')}</p><table>${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5A645E">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>`
  };
  const pe = patientEmail(s, PRICES, { attached: toPatient });
  const patient = {
    from: process.env.ENQUIRY_FROM,
    to: [s.customer_details && s.customer_details.email || s.customer_email],
    reply_to: String(process.env.ENQUIRY_TO || '').split(',')[0].trim(),
    ...(toPatient ? { attachments: [form] } : {}),
    subject: pe.subject, html: pe.html, text: pe.text
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
  // Checkout started on the website but not paid within the hour: tell the team so they can follow up
  if (event.type === 'checkout.session.expired' && s && (s.metadata || {}).order_type && process.env.RESEND_API_KEY && process.env.ENQUIRY_FROM && process.env.ENQUIRY_TO) {
    const m = s.metadata;
    const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Unknown';
    const total = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format((s.amount_total || 0) / 100);
    const rows = [['Checkout reference', m.reference], ['Items', m.items], ['Total', total], ['Collection', m.collection], ['Name', name], ['Email', s.customer_email || (s.customer_details || {}).email], ['Phone', m.phone], ['Address', [m.address, m.suburb, m.state, m.postcode].filter(Boolean).join(', ')], ['Preferred date', m.preferred_date], ['Preferred time', m.preferred_time]];
    try {
      await send({ from: process.env.ENQUIRY_FROM, to: process.env.ENQUIRY_TO.split(',').map((x) => x.trim()).filter(Boolean), subject: `Payment not completed ${m.reference}: ${name} (${total})`,
        html: `<p><strong>This customer started checkout but did not pay.</strong> Call them to complete the booking, or send a payment link.</p><table>${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5A645E">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>` });
    } catch (e) { console.error('expired email failed:', e.message); return res.status(500).json({ error: 'Email failed' }); }
    return res.status(200).json({ received: true, expired: true });
  }
  if (!relevant) return res.status(200).json({ received: true, ignored: event.type });
  if (!process.env.RESEND_API_KEY || !process.env.ENQUIRY_FROM || !process.env.ENQUIRY_TO) { console.error('order email not configured'); return res.status(500).json({ error: 'Email not configured' }); }
  try {
    // Sequential order number replaces the checkout reference everywhere the customer or lab sees it
    const m = s.metadata = { ...(s.metadata || {}) };
    // Payments not made through the website checkout (for example a Stripe payment link sent by the
    // team): notify the team only, with no order number, request form or patient email
    if (!m.order_type) {
      const total = new Intl.NumberFormat('en-AU', { style: 'currency', currency: String(s.currency || 'aud').toUpperCase() }).format((s.amount_total || 0) / 100);
      const who = (s.customer_details && (s.customer_details.name || s.customer_details.email)) || 'unknown customer';
      await send({ from: process.env.ENQUIRY_FROM, to: process.env.ENQUIRY_TO.split(',').map((x) => x.trim()), subject: `Payment received (not a website order): ${total} from ${who}`,
        html: `<p>A payment was received outside the website checkout, for example through a Stripe payment link. No confirmation was sent to the customer.</p><p>Amount: ${esc(total)}<br>Customer: ${esc(who)}${s.customer_details && s.customer_details.email ? ' (' + esc(s.customer_details.email) + ')' : ''}<br>Stripe session: ${esc(s.id)}</p>` });
      return res.status(200).json({ received: true, external: true });
    }
    m.checkout_ref = m.reference;
    try { m.reference = '#' + await orderNumber(s); } catch (e) { console.error('order number failed:', e.message); }
    let form = null, formError = '';
    try { form = await requestForm(s); } catch (e) { formError = e.message; console.error('request form failed:', e.message); }
    const { team, patient } = emails(s, form, formError);
    await send(team);
    if (patient.to[0]) await send(patient).catch((e) => console.error('patient email failed:', e.message));
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('order email failed:', e.message);
    return res.status(500).json({ error: 'Email failed' }); // Stripe will retry
  }
}
