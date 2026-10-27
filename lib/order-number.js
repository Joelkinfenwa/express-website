// Sequential order numbers for paid orders, assigned at payment and stored on the Stripe
// PaymentIntent (metadata.order_number) so webhook retries reuse the same number.
// Numbers start at ORDER_NUMBER_START (default 10001), clear of the Shopify order numbers.
import { stripe } from './stripe.js';

export async function orderNumber(session) {
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent && session.payment_intent.id;
  if (!piId) throw new Error('session has no payment intent');
  const pi = await stripe('GET', `/payment_intents/${piId}`);
  if (pi.metadata && /^\d+$/.test(pi.metadata.order_number || '')) return Number(pi.metadata.order_number);
  const n = (await highest()) + 1;
  await stripe('POST', `/payment_intents/${piId}`, { metadata: { order_number: String(n) } });
  return n;
}

// Highest order number so far across website payments and partner referrals (one shared sequence).
// Partner referrals are not paid through Stripe; each is recorded as a Stripe customer
// (metadata.type = partner_referral) so it takes a number from the same sequence.
async function highest() {
  const start = Number(process.env.ORDER_NUMBER_START) || 10001;
  const [pis, refs] = await Promise.all([stripe('GET', '/payment_intents?limit=100'), stripe('GET', '/customers?limit=100')]);
  return [...(pis.data || []), ...(refs.data || [])].map((x) => Number((x.metadata || {}).order_number) || 0).reduce((a, b) => Math.max(a, b), start - 1);
}

export async function referralNumber(partner) {
  const n = (await highest()) + 1;
  await stripe('POST', '/customers', { description: `Partner referral #${n} (${partner})`, metadata: { type: 'partner_referral', order_number: String(n), partner } });
  return n;
}
