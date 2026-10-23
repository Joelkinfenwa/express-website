// Returns the paid value of a Checkout Session for conversion tracking on /order-confirmed.
// Exposes only the total, currency and an order identifier; no personal details.
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
      transaction_id: (s.metadata && s.metadata.reference) || s.id,
      items: String((s.metadata && s.metadata.items) || '').split('; ').filter(Boolean).map((n) => ({ item_name: n }))
    });
  } catch (e) {
    return res.status(404).json({ error: 'Not found' });
  }
}
