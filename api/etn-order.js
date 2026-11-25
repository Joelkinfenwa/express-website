// Live orders from the Empowered Through Nutrition page (expresspathology.com.au/empowered).
// The client pays by card at checkout: panel price plus the home visit fee when chosen. Creates a
// Stripe Checkout Session; the webhook (order_type etn_order) issues the request form, emails the
// team and the patient, and records the order.
import { stripe } from '../lib/stripe.js';
import { ETN } from '../lib/etn.mjs';

const ALLOWED_ORIGIN = /^https:\/\/(www\.)?expresspathology\.com\.au$/;
const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'];
const str = (v, max = 160) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const panelKey = str(body.panel, 12);
  const panel = ETN.panels[panelKey];
  if (!panel) return res.status(400).json({ error: 'Please select a panel.' });
  const home = str(body.collection, 10) === 'home';

  const p = {
    firstName: str(body.firstName, 60), lastName: str(body.lastName, 60), email: str(body.email, 160).toLowerCase(),
    phone: str(body.phone, 30), dob: str(body.dob, 10), sex: str(body.sex, 10),
    address: str(body.address, 160), suburb: str(body.suburb, 80), state: str(body.state, 3).toUpperCase(), postcode: str(body.postcode, 4)
  };
  if (!p.firstName || !p.lastName) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (p.phone.replace(/\D/g, '').length < 8) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dob)) return res.status(400).json({ error: 'Please enter your date of birth.' });
  if (!['Male', 'Female'].includes(p.sex)) return res.status(400).json({ error: 'Please select sex.' });
  if (!p.address) return res.status(400).json({ error: 'Please enter your street address.' });
  if (!p.suburb) return res.status(400).json({ error: 'Please enter your suburb.' });
  if (!STATES.includes(p.state)) return res.status(400).json({ error: 'Please select your state.' });
  if (!/^\d{4}$/.test(p.postcode)) return res.status(400).json({ error: 'Please enter a 4-digit postcode.' });

  const reference = 'ETN-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const origin = ALLOWED_ORIGIN.test(String(req.headers.origin || '')) ? req.headers.origin : 'https://expresspathology.com.au';
  const items = [{ quantity: 1, price_data: { currency: 'aud', unit_amount: panel.p * 100, product_data: { name: `${panel.n} — Empowered Through Nutrition blood panel`, description: `${panel.lines.length} tests, GST included` } } }];
  if (home) items.push({ quantity: 1, price_data: { currency: 'aud', unit_amount: ETN.homeFee * 100, product_data: { name: 'At-home nurse visit', description: 'A qualified nurse collects at your home or workplace. Exact time confirmed within 4 hours.' } } });

  try {
    const session = await stripe('POST', '/checkout/sessions', {
      mode: 'payment',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      customer_email: p.email,
      client_reference_id: reference,
      success_url: `${origin}/empowered?paid=1&ref=${encodeURIComponent(reference)}${home ? '&home=1' : ''}`,
      cancel_url: `${origin}/empowered`,
      line_items: items,
      metadata: {
        order_type: 'etn_order', reference, panel: panelKey,
        collection: home ? 'home' : 'clinic',
        preferred_date: str(body.preferredDate, 10), preferred_time: str(body.preferredTime, 20),
        first_name: p.firstName, last_name: p.lastName, phone: p.phone, dob: p.dob, sex: p.sex,
        address: p.address, suburb: p.suburb, state: p.state, postcode: p.postcode
      },
      payment_intent_data: { description: `Express Pathology — ETN ${panel.n} ${reference}`, metadata: { reference, order_type: 'etn_order' } }
    });
    return res.status(200).json({ url: session.url, reference });
  } catch (e) {
    console.error('etn checkout failed:', e.message);
    if (e.code === 'not_configured') return res.status(503).json({ error: 'Online payment is being set up. Please call us on 02 9545 2940.' });
    return res.status(502).json({ error: 'We could not start checkout. Please call us on 02 9545 2940.' });
  }
}
