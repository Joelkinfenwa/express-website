// Revenue tracker (behind the orders tracker sign-in plus a PIN). Adds up sales for Express (website
// orders paid through Stripe, plus any non-Primal Zone Shopify orders) and Primal Zone (Shopify orders),
// net of refunds, grouped by Sydney date.
import crypto from 'node:crypto';
import { verify } from '../../lib/admin-auth.js';
import { sessions } from './orders.js';
import { shopifyConfigured, shopifyGraphQL } from '../../lib/shopify-admin.js';
import INVOICE from '../../lib/partner-prices.mjs';
function listPrice(partner, title, original) {
  const table = INVOICE[partner] || {};
  const hit = Object.keys(table).find((k) => title.toLowerCase().includes(k.toLowerCase()));
  return hit ? Number(table[hit]) : original;
}

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
  const invoices = [];
  if (!shopifyConfigured()) return { out: [], invoices };
  const q = `query($after: String) { orders(first: 250, after: $after, sortKey: CREATED_AT, reverse: true, query: "created_at:>=2026-01-01 -status:cancelled") {
    pageInfo { hasNextPage endCursor }
    nodes { name createdAt tags sourceName note displayFinancialStatus discountCodes
      currentTotalPriceSet { shopMoney { amount } } totalDiscountsSet { shopMoney { amount } }
      shippingAddress { firstName lastName } billingAddress { firstName lastName }
      lineItems(first: 20) { nodes { title variantTitle quantity originalUnitPriceSet { shopMoney { amount } } } } } } }`;
  const out = [];
  let after = null;
  for (let i = 0; i < 12; i++) {
    const d = await shopifyGraphQL(q, { after });
    for (const o of d.orders.nodes) {
      if (/VOIDED|PENDING|AUTHORIZED|EXPIRED/.test(o.displayFinancialStatus || '')) continue;
      const pz = /primal/i.test([o.tags.join(' '), o.sourceName, o.note, o.lineItems.nodes.map((l) => l.title).join(' ')].join(' '));
      const paid = Number(o.currentTotalPriceSet.shopMoney.amount || 0);
      if (paid > 0) { out.push({ biz: pz ? 'pz' : 'ep', date: day(Date.parse(o.createdAt)), amount: paid }); continue; }
      if (!pz) continue;
      // $0 Primal Zone order: invoiced to Primal Zone at month end
      const items = o.lineItems.nodes.map((l) => ({ title: l.title + (l.variantTitle && l.variantTitle !== 'Default Title' ? ` (${l.variantTitle})` : ''), qty: l.quantity || 1, value: listPrice('Primal Zone', l.title, Number(l.originalUnitPriceSet.shopMoney.amount || 0)) }));
      const value = items.reduce((t, i) => t + i.value * i.qty, 0);
      const discounted = (o.discountCodes || []).length > 0 || Number(o.totalDiscountsSet.shopMoney.amount || 0) > 0;
      const a = o.shippingAddress || o.billingAddress || {};
      invoices.push({ date: day(Date.parse(o.createdAt)), order: o.name, patient: [a.firstName, a.lastName].filter(Boolean).join(' '), items: items.map((i) => (i.qty > 1 ? i.qty + ' x ' : '') + i.title).join(', '), value, reason: discounted ? 'Secondary panel (100% discount)' : 'Ordering API ($0)', check: value <= 0 });
      out.push({ biz: 'pzinv', date: day(Date.parse(o.createdAt)), amount: value });
    }
    if (!d.orders.pageInfo.hasNextPage) break;
    after = d.orders.pageInfo.endCursor;
  }
  return { out, invoices };
}

export default async function handler(req, res) {
  if (!verify(req)) return res.status(401).json({ error: 'Please sign in again.' });
  if (!pinOk(req.headers['x-revenue-pin'])) return res.status(403).json({ error: 'Incorrect PIN.' });
  try {
    const [a, b] = await Promise.all([stripeSales(), shopifySales().catch((e) => { console.error('shopify revenue failed:', e.message); return null; })]);
    const byDay = {};
    for (const x of a.concat(b ? b.out : [])) {
      const d = byDay[x.date] || (byDay[x.date] = { ep: 0, pz: 0, pzinv: 0, epN: 0, pzN: 0, pzinvN: 0 });
      d[x.biz] += x.amount; d[x.biz + 'N'] += 1;
    }
    return res.status(200).json({ days: byDay, invoices: (b ? b.invoices : []).sort((x, y) => (x.date < y.date ? 1 : -1)), today: day(Date.now()), shopify: b ? 'ok' : (shopifyConfigured() ? 'error' : 'not_configured') });
  } catch (e) {
    console.error('revenue failed:', e.message);
    return res.status(500).json({ error: 'Could not load revenue. Try again.' });
  }
}
