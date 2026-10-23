// Returns the paid value of a Checkout Session for conversion tracking on /order-confirmed.
// Exposes only the total, currency, an order identifier and a one-way hash of the email.
import crypto from 'node:crypto';
import { stripe } from '../lib/stripe.js';

export default async function handler(req, res) {
  const id = String((req.query && req.query.session_id) || '');
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: 'Invalid session' });
  try {
    const s = await stripe('GET', `/checkout/sessions/${id}`);
    const paid = s.payment_status === 'paid' || s.status === 'complete';
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      paid, value: (s.amount_total || 0) / 100, currency: String(s.currency || 'aud').toUpperCase(),
      // Enhanced conversions: SHA-256 of the normalised email only, never the email itself
      email_sha256: (() => { const e = String((s.customer_details && s.customer_details.email) || s.customer_email || '').trim().toLowerCase(); return e ? crypto.createHash('sha256').update(e).digest('hex') : ''; })(),
      transaction_id: (s.metadata && s.metadata.reference) || s.id,
      items: String((s.metadata && s.metadata.items) || '').split('; ').filter(Boolean).map((n) => ({ item_name: n }))
    });
  } catch (e) {
    return res.status(404).json({ error: 'Not found' });
  }
}
