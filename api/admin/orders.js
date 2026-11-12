// Orders tracker data. GET lists paid website orders and partner referrals with their current stage;
// POST updates one order's stage or note. The stage is stored on the order in Stripe (metadata), so
// there is no separate database: website orders on the PaymentIntent, referrals on their Stripe customer.
import { stripe } from '../../lib/stripe.js';
import { verify } from '../../lib/admin-auth.js';

export const STAGES = ['paid', 'form_sent', 'booked', 'collected', 'results_in', 'review', 'sent'];

async function sessions() {
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

function fromSession(s) {
  const m = s.metadata || {};
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  if (s.payment_status !== 'paid' || !m.order_type || !pi) return null;
  const pm = pi.metadata || {};
  const charge = pi.latest_charge;
  const [updated, by] = String(pm.ops_updated || '').split('|');
  return {
    id: pi.id, kind: 'pi', order: pm.order_number ? '#' + pm.order_number : m.reference, date: s.created,
    name: [m.first_name, m.last_name].filter(Boolean).join(' '), email: (s.customer_details && s.customer_details.email) || s.customer_email || '',
    phone: m.phone || '', items: m.items || '', type: m.order_type, collection: m.collection || '', total: (s.amount_total || 0) / 100,
    preferred: [m.preferred_date, m.preferred_time].filter(Boolean).join(', '), addto: m.addto || '',
    stage: STAGES.includes(pm.ops_stage) ? pm.ops_stage : (m.order_type === 'own-form' ? 'paid' : 'form_sent'),
    note: pm.ops_note || '', appt: pm.ops_appt || '', nurse: pm.ops_nurse || '', address: [m.address, m.suburb, m.state, m.postcode].filter(Boolean).join(', '), updated: updated || '', by: by || '', refunded: !!(charge && typeof charge === 'object' && (charge.refunded || charge.amount_refunded > 0))
  };
}

async function referrals() {
  const r = await stripe('GET', '/customers?limit=100');
  return (r.data || []).filter((c) => (c.metadata || {}).type === 'partner_referral').map((c) => {
    const m = c.metadata;
    const [updated, by] = String(m.ops_updated || '').split('|');
    return {
      id: c.id, kind: 'cus', order: '#' + m.order_number, date: c.created, name: m.patient || '', email: m.submitter || '', phone: '',
      items: `Partner referral (${m.partner || ''})`, type: 'referral', collection: 'Home visit', total: 0, preferred: '', addto: '',
      stage: STAGES.includes(m.ops_stage) ? m.ops_stage : 'paid', note: m.ops_note || '', appt: m.ops_appt || '', nurse: m.ops_nurse || '', address: '', updated: updated || '', by: by || ''
    };
  });
}

export default async function handler(req, res) {
  const who = verify(req);
  if (!who) return res.status(401).json({ error: 'Please sign in again.' });
  try {
    if (req.method === 'GET') {
      const [s, r] = await Promise.all([sessions(), referrals().catch(() => [])]);
      const orders = s.map(fromSession).filter(Boolean).concat(r).sort((a, b) => b.date - a.date);
      return res.status(200).json({ orders, user: who });
    }
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      b = b || {};
      const id = String(b.id || '');
      const path = b.kind === 'cus' && /^cus_\w+$/.test(id) ? `/customers/${id}` : /^pi_\w+$/.test(id) ? `/payment_intents/${id}` : '';
      if (!path) return res.status(400).json({ error: 'Unknown order.' });
      const metadata = { ops_updated: `${new Date().toISOString()}|${who}` };
      if (b.stage !== undefined) { if (!STAGES.includes(b.stage)) return res.status(400).json({ error: 'Unknown stage.' }); metadata.ops_stage = b.stage; }
      if (b.note !== undefined) metadata.ops_note = String(b.note).slice(0, 480);
      if (b.nurse !== undefined) metadata.ops_nurse = String(b.nurse).trim().slice(0, 60);
      if (b.appt !== undefined) { const a = String(b.appt).slice(0, 16); if (a && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(a)) return res.status(400).json({ error: 'Invalid appointment time.' }); metadata.ops_appt = a; }
      await stripe('POST', path, { metadata });
      return res.status(200).json({ ok: true, updated: metadata.ops_updated.split('|')[0], by: who });
    }
    return res.status(405).end();
  } catch (e) {
    console.error('admin orders failed:', e.message);
    return res.status(500).json({ error: 'Could not reach Stripe. Try again.' });
  }
}
