// Temporary: sends the patient confirmation (with the request form attached) for orders #10001 and
// #10003 to the Express team inbox, so the team can forward them to the patients. Removed after use.
import PRICES from '../lib/price-index.mjs';
import { stripe } from '../lib/stripe.js';
import { requestForm } from './stripe-webhook.js';
import { patientEmail } from '../lib/patient-email.js';

const ORDERS = ['10001', '10003'];
const TEAM = 'express@expresspathology.com.au';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.RESEND_API_KEY || !process.env.ENQUIRY_FROM) return res.status(500).json({ error: 'Email not configured' });
  const out = [];
  try {
    const from = Math.floor(Date.parse('2026-10-22T00:00:00Z') / 1000);
    const list = await stripe('GET', `/checkout/sessions?limit=100&status=complete&created[gte]=${from}&expand[]=data.payment_intent`);
    for (const s of list.data || []) {
      const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
      const n = pi && (pi.metadata || {}).order_number;
      if (!ORDERS.includes(n) || s.payment_status !== 'paid') continue;
      const m = s.metadata || {};
      m.checkout_ref = m.reference;
      m.reference = '#' + n;
      const form = await requestForm(s);
      if (!form) { out.push({ order: n, status: 'no form' }); continue; }
      const pe = patientEmail(s, PRICES, { attached: true });
      const patientTo = (s.customer_details && s.customer_details.email) || s.customer_email || '';
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.ENQUIRY_FROM, to: [TEAM], subject: `${pe.subject} - forward to ${patientTo}`, html: pe.html, text: pe.text, attachments: [form] })
      });
      const body = await r.text();
      out.push({ order: n, status: r.ok ? 'sent to ' + TEAM : 'failed ' + r.status, resend: body.slice(0, 200) });
    }
    return res.status(200).json({ results: out });
  } catch (e) {
    return res.status(500).json({ error: e.message, results: out });
  }
}
