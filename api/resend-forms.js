// One-off: sends the paid-order confirmation with the request form attached to private-pay patients
// whose orders were paid before the form was always attached (23 to 27 October 2026).
// Each order is sent once (PaymentIntent metadata.form_resent) and only to that order's own email.
import PRICES from '../lib/price-index.mjs';
import { stripe } from '../lib/stripe.js';
import { requestForm } from './stripe-webhook.js';
import { patientEmail } from '../lib/patient-email.js';

const FROM = Date.parse('2026-10-22T00:00:00Z') / 1000;
const TO = Date.parse('2026-10-27T00:16:00Z') / 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const force = String(req.query.force || '');
  if (!process.env.RESEND_API_KEY || !process.env.ENQUIRY_FROM) return res.status(500).json({ error: 'Email not configured' });
  const out = [];
  try {
    const list = await stripe('GET', `/checkout/sessions?limit=100&status=complete&created[gte]=${FROM}&created[lte]=${TO}&expand[]=data.payment_intent`);
    for (const s of list.data || []) {
      const m = s.metadata || {};
      const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
      if (s.payment_status !== 'paid' || !pi || !['panel', 'builder'].includes(m.order_type)) continue;
      if ((pi.metadata || {}).form_resent && force !== pi.metadata.order_number) { out.push({ order: pi.metadata.order_number, status: 'already sent', at: pi.metadata.form_resent }); continue; }
      if (!force || force !== (pi.metadata || {}).order_number) { out.push({ order: (pi.metadata || {}).order_number, status: 'skipped (not forced)' }); continue; }
      const email = (s.customer_details && s.customer_details.email) || s.customer_email;
      if (!email) continue;
      m.checkout_ref = m.reference;
      if (/^\d+$/.test((pi.metadata || {}).order_number || '')) m.reference = '#' + pi.metadata.order_number;
      const form = await requestForm(s);
      if (!form) { out.push({ order: m.reference, status: 'no form' }); continue; }
      const pe = patientEmail(s, PRICES, { attached: true });
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.ENQUIRY_FROM, to: [email], reply_to: String(process.env.ENQUIRY_TO || '').split(',')[0].trim() || undefined, subject: pe.subject, html: pe.html, text: pe.text, attachments: [form] })
      });
      const body = await r.text();
      if (!r.ok) { out.push({ order: m.reference, status: 'email failed ' + r.status, body: body.slice(0, 300) }); continue; }
      await stripe('POST', `/payment_intents/${pi.id}`, { metadata: { form_resent: new Date().toISOString() } });
      out.push({ order: m.reference, items: m.items, status: 'sent', resend: body.slice(0, 200), to_domain: email.split('@')[1] });
    }
    return res.status(200).json({ results: out });
  } catch (e) {
    console.error('resend forms failed:', e.message);
    return res.status(500).json({ error: 'failed', results: out });
  }
}
