// Order visibility for clinic teams (expresspathology.com.au/optimal-portal). Read-only: lists the
// clinic's own orders with a clinic-friendly status derived from the ops stage the Express team
// maintains in /admin. Auth: a shared password per clinic, set in Vercel env (OHC_PORTAL_PASSWORD).
// Internal fields (nurse assignment, ops notes) are never returned.
import crypto from 'node:crypto';
import { allCustomers } from '../lib/order-number.js';

const CLINICS = {
  OHC: { env: 'OHC_PORTAL_PASSWORD', name: 'Optimal Health Clinic' },
  ETN: { env: 'ETN_PORTAL_PASSWORD', name: 'Empowered Through Nutrition' },
  COMO: { env: 'COMO_PORTAL_PASSWORD', name: 'Como Wellness' },
  LH: { env: 'LH_PORTAL_PASSWORD', name: 'Lighthouse WBH' }
};

// Clinic-facing status from the internal ops stage
function status(stage) {
  if (['booked'].includes(stage)) return { key: 'booked', label: 'Home visit booked' };
  if (['collected', 'dropped'].includes(stage)) return { key: 'collected', label: 'Bloods collected' };
  if (['results_in', 'review'].includes(stage)) return { key: 'review', label: 'Results in review' };
  if (stage === 'sent') return { key: 'sent', label: 'Results sent to clinic' };
  return { key: 'awaiting', label: 'Ordered — awaiting collection' };
}

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const clinic = CLINICS[String(body.clinic || 'OHC').toUpperCase()];
  if (!clinic) return res.status(400).json({ error: 'Unknown clinic.' });
  const expected = process.env[clinic.env];
  if (!expected) return res.status(503).json({ error: 'The portal is being set up. Please contact Express Pathology.' });
  if (!body.password || !safeEqual(body.password, expected)) return res.status(401).json({ error: 'Incorrect password.' });

  try {
    const all = await allCustomers();
    const orders = all
      .filter((c) => { const m = c.metadata || {}; return m.type === 'clinic_order' && m.partner === String(body.clinic || 'OHC').toUpperCase() && m.deleted !== '1'; })
      .map((c) => {
        const m = c.metadata;
        const st = status(m.ops_stage);
        return {
          reference: m.reference || '', date: c.created,
          patient: m.patient || '', dob: m.dob || '', email: m.email || '', phone: m.phone || '',
          items: m.items || '', collection: m.collection || '', preferred: m.preferred || '',
          appointment: m.ops_appt || '', total: Number(m.total) || 0,
          status: st.key, statusLabel: st.label
        };
      })
      .sort((a, b) => b.date - a.date);
    return res.status(200).json({ clinic: clinic.name, orders });
  } catch (e) {
    console.error('clinic portal failed:', e.message);
    return res.status(502).json({ error: 'Orders could not be loaded. Please try again.' });
  }
}
