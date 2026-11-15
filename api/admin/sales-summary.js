// Read-only sales summary for automated revenue tracking (Claude's daily sync).
// GET /api/admin/sales-summary?key=REPORT_KEY lists paid website orders from Stripe:
// date (Sydney), order reference, items, type, total, source and creator code.
// Returns 401 unless the key matches the REPORT_KEY environment variable.
import { stripe } from '../../lib/stripe.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const key = String((req.query && req.query.key) || '');
  if (!process.env.REPORT_KEY || key.length < 16 || key !== process.env.REPORT_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const orders = [];
    let after = '';
    for (let page = 0; page < 5; page++) {
      const r = await stripe('GET', `/checkout/sessions?limit=100&status=complete${after ? '&starting_after=' + after : ''}`);
      for (const s of r.data || []) {
        const m = s.metadata || {};
        if (s.payment_status !== 'paid' || !m.order_type) continue;
        orders.push({
          date: new Date(s.created * 1000).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }),
          order: m.reference || '', items: m.items || '', type: m.order_type,
          total: (s.amount_total || 0) / 100, source: m.source || '', creator: m.creator || ''
        });
      }
      if (!r.has_more || !r.data.length) break;
      after = r.data[r.data.length - 1].id;
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ generated: new Date().toISOString(), count: orders.length, orders });
  } catch (e) {
    console.error('sales summary failed:', e.message);
    return res.status(502).json({ error: 'Could not read orders' });
  }
}
