// Sequential order numbers for paid orders, assigned at payment and stored on the Stripe
// PaymentIntent (metadata.order_number) so webhook retries reuse the same number.
// Numbers start at ORDER_NUMBER_START (default 10001), clear of the Shopify order numbers.
import { stripe } from './stripe.js';

export async function orderNumber(session) {
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent && session.payment_intent.id;
  if (!piId) throw new Error('session has no payment intent');
  const pi = await stripe('GET', `/payment_intents/${piId}`);
  if (pi.metadata && /^\d+$/.test(pi.metadata.order_number || '')) return Number(pi.metadata.order_number);
  const start = Number(process.env.ORDER_NUMBER_START) || 10001;
  // Highest number so far among recent payments (order volume makes 100 ample)
  const recent = await stripe('GET', '/payment_intents?limit=100');
  const max = (recent.data || []).map((p) => Number((p.metadata || {}).order_number) || 0).reduce((a, b) => Math.max(a, b), start - 1);
  const n = max + 1;
  await stripe('POST', `/payment_intents/${piId}`, { metadata: { order_number: String(n) } });
  return n;
}
