// Orders tracker data. GET lists paid website orders and partner referrals with their current stage;
// POST updates one order's stage or note. The stage is stored on the order in Stripe (metadata), so
// there is no separate database: website orders on the PaymentIntent, referrals on their Stripe customer.
import { stripe } from '../../lib/stripe.js';
import { verify } from '../../lib/admin-auth.js';
import PRICES from '../../lib/price-index.mjs';
import { orderFromSession } from '../../lib/request-form.js';
import { shopifyConfigured, shopifyGraphQL } from '../../lib/shopify-admin.js';
import { allCustomers, jobNumber } from '../../lib/order-number.js';
import { JOB_PARTNERS } from '../../lib/partner-prices.mjs';

// 'dropped' (bloods dropped at the lab) completes a home visit on the patient's own GP form: results go to their doctor
export const STAGES = ['paid', 'form_sent', 'booked', 'collected', 'dropped', 'results_in', 'review', 'sent'];

export async function sessions() {
  const out = [];
  let after = '';
  for (let page = 0; page < 5; page++) {
    const r = await stripe('GET', `/checkout/sessions?limit=100&status=complete&expand[]=data.payment_intent.latest_charge${after ? '&starting_after=' + after : ''}`);
    out.push(...(r.data || []));
    if (!r.has_more || !r.data.length) break;
    after = r.data[r.data.length - 1].id;
  }
  return out;
}

export function fromSession(s) {
  const m = s.metadata || {};
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  if (s.payment_status !== 'paid' || !m.order_type || !pi) return null;
  const pm = pi.metadata || {};
  const charge = pi.latest_charge;
  const [updated, by] = String(pm.ops_updated || '').split('|');
  // Results checklist: the same test lines printed on the pathology request form
  let lines = [];
  if (m.order_type === 'panel' || m.order_type === 'builder') { try { lines = [...new Set(orderFromSession(s, PRICES).items.flatMap((i) => i.lines || []).map((l) => String(l).trim()).filter(Boolean))]; } catch {} }
  return {
    lines, ticks: String(pm.ops_ticks || '').split(',').filter((x) => /^\d+$/.test(x)).map(Number),
    id: pi.id, kind: 'pi', order: pm.order_number ? '#' + pm.order_number : m.reference, date: s.created,
    name: [m.first_name, m.last_name].filter(Boolean).join(' '), email: (s.customer_details && s.customer_details.email) || s.customer_email || '',
    phone: m.phone || '', items: m.items || '', type: m.order_type, collection: m.collection || '', total: (s.amount_total || 0) / 100,
    preferred: [m.preferred_date, m.preferred_time].filter(Boolean).join(', '), addto: m.addto || '',
    stage: STAGES.includes(pm.ops_stage) ? pm.ops_stage : (m.order_type === 'own-form' ? 'paid' : 'form_sent'),
    note: pm.ops_note || '', appt: pm.ops_appt || '', nurse: pm.ops_nurse || '', address: [m.address, m.suburb, m.state, m.postcode].filter(Boolean).join(', '), updated: updated || '', by: by || '', refunded: !!(charge && typeof charge === 'object' && (charge.refunded || charge.amount_refunded > 0))
  };
}

export async function referrals() {
  const all = await allCustomers();
  return all.filter((c) => ['partner_referral', 'partner_job'].includes((c.metadata || {}).type) && (c.metadata || {}).deleted !== '1').map((c) => {
    const m = c.metadata;
    const [updated, by] = String(m.ops_updated || '').split('|');
    if (m.type === 'partner_job') {
      const qty = Number(m.qty) || 1, p = JOB_PARTNERS[m.partner] || {};
      return {
        id: c.id, kind: 'cus', order: '#' + m.order_number, date: c.created, name: m.patient || '', email: m.email || '', phone: m.phone || '',
        items: `${qty} x ${p.item || 'Test'} (${m.partner})`, type: 'job', partner: m.partner, qty, collection: 'Home visit', total: 0, preferred: m.job_date || '', addto: '',
        stage: STAGES.includes(m.ops_stage) ? m.ops_stage : 'paid', note: m.ops_note || '', appt: m.ops_appt || '', nurse: m.ops_nurse || '', address: m.address || '', updated: updated || '', by: by || ''
      };
    }
    return {
      id: c.id, kind: 'cus', order: '#' + m.order_number, date: c.created, name: m.patient || '', email: m.submitter || '', phone: '',
      items: `Partner referral (${m.partner || ''})`, type: 'referral', collection: 'Home visit', total: 0, preferred: '', addto: '',
      stage: STAGES.includes(m.ops_stage) ? m.ops_stage : 'paid', note: m.ops_note || '', appt: m.ops_appt || '', nurse: m.ops_nurse || '', address: '', updated: updated || '', by: by || ''
    };
  });
}

// Shopify orders (Primal Zone: primalzonebloods.com and the Primal Zone API both create orders in Express's
// Shopify). The tracker stage is saved on the Shopify order as metafields (namespace express_tracker).
const SHOP_FROM = '2026-10-15';
const FEE = /^(home visit|mobile nurse|nurse|build your own test fee|tip|shipping)/i;
async function shopifyOrders() {
  if (!shopifyConfigured()) return { orders: [], status: 'not_configured' };
  const q = `query($after: String) { orders(first: 100, after: $after, sortKey: CREATED_AT, reverse: true, query: "created_at:>=${SHOP_FROM} -status:cancelled") {
    pageInfo { hasNextPage endCursor }
    nodes { id name createdAt displayFinancialStatus tags note sourceName email phone
      totalPriceSet { shopMoney { amount } }
      shippingAddress { firstName lastName address1 address2 city provinceCode zip phone }
      billingAddress { firstName lastName address1 city provinceCode zip phone }
      lineItems(first: 40) { nodes { title variantTitle quantity } }
      metafields(namespace: "express_tracker", first: 12) { nodes { key value } } } } }`;
  const nodes = [];
  let after = null;
  for (let i = 0; i < 3; i++) {
    const d = await shopifyGraphQL(q, { after });
    nodes.push(...d.orders.nodes);
    if (!d.orders.pageInfo.hasNextPage) break;
    after = d.orders.pageInfo.endCursor;
  }
  const orders = nodes.filter((o) => !/REFUNDED|VOIDED/.test(o.displayFinancialStatus || '')).map((o) => {
    const mf = Object.fromEntries((o.metafields.nodes || []).map((x) => [x.key, x.value]));
    const c = {}, a = o.shippingAddress || o.billingAddress || {};
    const titles = o.lineItems.nodes.map((l) => l.title + (l.variantTitle && l.variantTitle !== 'Default Title' ? ` (${l.variantTitle})` : ''));
    const home = titles.some((t) => /nurse|home visit|mobile/i.test(t));
    const partner = /primal/i.test([o.tags.join(' '), o.sourceName, titles.join(' '), o.note].join(' ')) ? 'Primal Zone' : 'Shopify';
    const [updated, by] = String(mf.updated || '').split('|');
    return {
      id: o.id, kind: 'shop', order: o.name, date: Math.floor(Date.parse(o.createdAt) / 1000),
      name: [c.firstName || a.firstName, c.lastName || a.lastName].filter(Boolean).join(' '), email: c.email || o.email || '', phone: c.phone || o.phone || a.phone || '',
      items: titles.join('; '), type: 'shopify', partner, collection: home ? 'Home visit' : 'Collection centre', fasting: partner === 'Primal Zone',
      total: Number(o.totalPriceSet.shopMoney.amount || 0), preferred: '', addto: '',
      lines: titles.filter((t) => !FEE.test(t)), ticks: String(mf.ticks || '').split(',').filter((x) => /^\d+$/.test(x)).map(Number),
      stage: STAGES.includes(mf.stage) ? mf.stage : (home ? 'paid' : 'form_sent'), note: mf.note || '', appt: mf.appt || '', nurse: mf.nurse || '',
      address: [a.address1, a.address2, a.city, a.provinceCode, a.zip].filter(Boolean).join(', '), updated: updated || '', by: by || ''
    };
  });
  return { orders, status: 'ok' };
}

async function saveShopify(id, fields) {
  const metafields = Object.entries(fields).map(([key, value]) => ({ ownerId: id, namespace: 'express_tracker', key, type: key === 'note' ? 'multi_line_text_field' : 'single_line_text_field', value: String(value) }));
  const keep = metafields.filter((m) => m.value !== '');
  const clear = metafields.filter((m) => m.value === '');
  if (keep.length) {
    const d = await shopifyGraphQL('mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { message } } }', { m: keep });
    if (d.metafieldsSet.userErrors.length) throw new Error(d.metafieldsSet.userErrors[0].message);
  }
  if (clear.length) await shopifyGraphQL('mutation($m: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $m) { userErrors { message } } }', { m: clear.map((x) => ({ ownerId: id, namespace: x.namespace, key: x.key })) });
}

export default async function handler(req, res) {
  const who = verify(req);
  if (!who) return res.status(401).json({ error: 'Please sign in again.' });
  try {
    if (req.method === 'GET') {
      const [s, r, sh] = await Promise.all([sessions(), referrals().catch(() => []), shopifyOrders().catch((e) => { console.error('shopify orders failed:', e.message); return { orders: [], status: 'error', error: e.message.slice(0, 200) }; })]);
      const orders = s.map(fromSession).filter(Boolean).concat(r, sh.orders).sort((a, b) => b.date - a.date);
      return res.status(200).json({ orders, user: who, shopify: { status: sh.status, error: sh.error || '' } });
    }
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      b = b || {};
      if (b.action === 'create_job') {
        const partner = String(b.partner || '');
        if (!JOB_PARTNERS[partner]) return res.status(400).json({ error: 'Unknown partner.' });
        // One job per worker: either workers [{ name, phone }] pasted as a list, or a single patient
        const list = (Array.isArray(b.workers) ? b.workers : [{ name: b.patient, phone: b.phone }])
          .map((w) => ({ name: String((w && w.name) || '').trim().slice(0, 120), phone: String((w && w.phone) || '').trim().slice(0, 40) })).filter((w) => w.name);
        if (!list.length) return res.status(400).json({ error: 'Enter at least one worker name.' });
        if (list.length > 60) return res.status(400).json({ error: 'Add up to 60 workers at a time.' });
        const qty = Math.max(1, Math.min(50, parseInt(b.qty, 10) || 1));
        const jd = String(b.job_date || '').slice(0, 10);
        if (jd && !/^\d{4}-\d{2}-\d{2}$/.test(jd)) return res.status(400).json({ error: 'Invalid date.' });
        const orders = [];
        let last = 0;
        for (const w of list) {
          last = await jobNumber({ partner, patient: w.name, qty: String(qty), job_date: jd, phone: w.phone || String(b.phone || '').slice(0, 40), email: String(b.email || '').slice(0, 120), address: String(b.address || '').slice(0, 200), ops_note: String(b.note || '').slice(0, 480), ops_updated: `${new Date().toISOString()}|${who}` }, last);
          orders.push('#' + last);
        }
        return res.status(200).json({ ok: true, order: orders[0], orders });
      }
      const id = String(b.id || '');
      const isShop = b.kind === 'shop' && /^gid:\/\/shopify\/Order\/\d+$/.test(id);
      const path = isShop ? 'shop' : b.kind === 'cus' && /^cus_\w+$/.test(id) ? `/customers/${id}` : /^pi_\w+$/.test(id) ? `/payment_intents/${id}` : '';
      if (!path) return res.status(400).json({ error: 'Unknown order.' });
      const metadata = { ops_updated: `${new Date().toISOString()}|${who}` };
      if (b.stage !== undefined) { if (!STAGES.includes(b.stage)) return res.status(400).json({ error: 'Unknown stage.' }); metadata.ops_stage = b.stage; }
      if (b.note !== undefined) metadata.ops_note = String(b.note).slice(0, 480);
      if (b.ticks !== undefined) { if (!Array.isArray(b.ticks) || b.ticks.some((x) => !Number.isInteger(x) || x < 0 || x > 200)) return res.status(400).json({ error: 'Invalid checklist.' }); metadata.ops_ticks = [...new Set(b.ticks)].sort((a, c) => a - c).join(',').slice(0, 480); }
      if (b.nurse !== undefined) metadata.ops_nurse = String(b.nurse).trim().slice(0, 60);
      if (b.appt !== undefined) { const a = String(b.appt).slice(0, 16); if (a && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(a)) return res.status(400).json({ error: 'Invalid appointment time.' }); metadata.ops_appt = a; }
      if (isShop) await saveShopify(id, Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k.replace(/^ops_/, ''), v])));
      else await stripe('POST', path, { metadata });
      return res.status(200).json({ ok: true, updated: metadata.ops_updated.split('|')[0], by: who });
    }
    return res.status(405).end();
  } catch (e) {
    console.error('admin orders failed:', e.message);
    return res.status(500).json({ error: 'Could not save or load orders. Try again.' });
  }
}
