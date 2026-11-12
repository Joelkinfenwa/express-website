// Finds a paid website order by its order number (PaymentIntent metadata.order_number) and returns
// its Stripe checkout session, so an add-on purchase can be matched to it.
import { stripe } from './stripe.js';

export async function findOrder(orderNo) {
  if (!/^\d{4,8}$/.test(String(orderNo || ''))) return null;
  const found = await stripe('GET', `/payment_intents/search?query=${encodeURIComponent(`metadata['order_number']:'${orderNo}'`)}&limit=1`);
  const pi = (found.data || [])[0];
  if (!pi) return null;
  const list = await stripe('GET', `/checkout/sessions?payment_intent=${pi.id}&limit=1`);
  const s = (list.data || [])[0];
  if (!s || s.payment_status !== 'paid') return null;
  return { session: s, email: String((s.customer_details && s.customer_details.email) || s.customer_email || '').toLowerCase() };
}
