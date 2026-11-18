// Revenue tracker (behind the orders tracker sign-in plus a PIN). Adds up sales for Express (website
// orders paid through Stripe, plus any non-Primal Zone Shopify orders) and Primal Zone (Shopify orders),
// net of refunds, grouped by Sydney date.
import crypto from 'node:crypto';
import { verify } from '../../lib/admin-auth.js';
import { sessions } from './orders.js';
import { shopifyConfigured, shopifyGraphQL } from '../../lib/shopify-admin.js';

const PIN_HASH = '0c5bae363ba974dffd32c31b0660672f674235ffc59aedfb7cd48aa591536571';
const pinOk = (pin) => { const h = crypto.createHash('sha256').update('ep-rev:' + String(pin || '')).digest(); return crypto.timingSafeEqual(h, Buffer.from(PIN_HASH, 'hex')); };
const day = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

async function stripeSales() {
  const out = [];
  for (const s of await sessions()) {
    const m = s.metadata || {};
    const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
    if (s.payment_status !== 'paid' || !m.order_type || !pi) continue;
    const ch = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
    const net = ((s.amount_total || 0) - (ch ? ch.amount_refunded || 0 : 0)) / 100;
    if (net <= 0) continue; // fully refunded
    out.push({ biz: 'ep', date: day(s.created * 1000), amount: net });
  }
  return out;
}

async function shopifySales() {
  if (!shopifyConfigured()) return [];
  const q = `query($after: String) { orders(first: 250, after: $after, sortKey: CREATED_AT, reverse: true, query: "created_at:>=2026-01-01 -status:cancelled") {
    pageInfo { hasNextPage endCursor }
    nodes { createdAt tags sourceName note displayFinancialStatus currentTotalPriceSet { shopMoney { amount } } lineItems(first: 5) { nodes { title } } } } }`;
  const out = [];
  let after = null;
  for (let i = 0; i < 12; i++) {
    const d = await shopifyGraphQL(q, { after });
    for (const o of d.orders.nodes) {
      if (/VOIDED|PENDING|AUTHORIZED|EXPIRED/.test(o.displayFinancialStatus || '')) continue;
      const pz = /primal/i.test([o.tags.join(' '), o.sourceName, o.note, o.lineItems.nodes.map((l) => l.title).join(' ')].join(' '));
      if (Number(o.currentTotalPriceSet.shopMoney.amount || 0) <= 0) continue;
      out.push({ biz: pz ? 'pz' : 'ep', date: day(Date.parse(o.createdAt)), amount: Number(o.currentTotalPriceSet.shopMoney.amount || 0) });
    }
    if (!d.orders.pageInfo.hasNextPage) break;
    after = d.orders.pageInfo.endCursor;
  }
  return out;
}

export default async function handler(req, res) {
  if (!verify(req)) return res.status(401).json({ error: 'Please sign in again.' });
  if (!pinOk(req.headers['x-revenue-pin'])) return res.status(403).json({ error: 'Incorrect PIN.' });
  try {
    const [a, b] = await Promise.all([stripeSales(), shopifySales().catch((e) => { console.error('shopify revenue failed:', e.message); return null; })]);
    const byDay = {};
    for (const x of a.concat(b || [])) {
      const d = byDay[x.date] || (byDay[x.date] = { ep: 0, pz: 0, epN: 0, pzN: 0 });
      d[x.biz] += x.amount; d[x.biz + 'N'] += 1;
    }
    return res.status(200).json({ days: byDay, today: day(Date.now()), shopify: b ? 'ok' : (shopifyConfigured() ? 'error' : 'not_configured') });
  } catch (e) {
    console.error('revenue failed:', e.message);
    return res.status(500).json({ error: 'Could not load revenue. Try again.' });
  }
}
