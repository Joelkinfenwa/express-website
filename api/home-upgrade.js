// Home visit upgrade for clinic-ordered collections (expresspathology.com.au/optimal-home).
// The patient pays the flat home-visit fee by card; the panel itself is billed to the clinic.
// Creates a Stripe Checkout Session; the webhook (order_type ohc_home_upgrade) notifies the team,
// confirms to the patient and updates the order record.
import { stripe } from '../lib/stripe.js';

const FEE = 75; // AUD incl. GST — the OHC home visit fee shown on /optimal
const ALLOWED_ORIGIN = /^https:\/\/(www\.)?expresspathology\.com\.au$/;
const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'];
const str = (v, max = 160) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const reference = str(body.reference, 14).toUpperCase();
  if (!/^OHC-[A-Z0-9]{4,8}$/.test(reference)) return res.status(400).json({ error: 'Please enter your order reference (it looks like OHC-XXXXX, from your confirmation email).' });
  const p = {
    firstName: str(body.firstName, 60), lastName: str(body.lastName, 60), email: str(body.email, 160).toLowerCase(),
    phone: str(body.phone, 30), address: str(body.address, 160), suburb: str(body.suburb, 80),
    state: str(body.state, 3).toUpperCase(), postcode: str(body.postcode, 4)
  };
  if (!p.firstName || !p.lastName) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (p.phone.replace(/\D/g, '').length < 8) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  if (!p.address) return res.status(400).json({ error: 'Please enter your street address.' });
  if (!p.suburb) return res.status(400).json({ error: 'Please enter your suburb.' });
  if (!STATES.includes(p.state)) return res.status(400).json({ error: 'Please select your state.' });
  if (!/^\d{4}$/.test(p.postcode)) return res.status(400).json({ error: 'Please enter a 4-digit postcode.' });

  const origin = ALLOWED_ORIGIN.test(String(req.headers.origin || '')) ? req.headers.origin : 'https://expresspathology.com.au';
  try {
    const session = await stripe('POST', '/checkout/sessions', {
      mode: 'payment',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      customer_email: p.email,
      client_reference_id: reference,
      success_url: `${origin}/optimal-home?paid=1&ref=${encodeURIComponent(reference)}`,
      cancel_url: `${origin}/optimal-home?ref=${encodeURIComponent(reference)}`,
      line_items: [{ quantity: 1, price_data: { currency: 'aud', unit_amount: FEE * 100, product_data: { name: `Home visit — order ${reference}`, description: 'A registered nurse collects at your home or workplace. Exact time confirmed within 4 hours.' } } }],
      metadata: {
        order_type: 'ohc_home_upgrade', reference,
        first_name: p.firstName, last_name: p.lastName, phone: p.phone,
        address: p.address, suburb: p.suburb, state: p.state, postcode: p.postcode,
        preferred_date: str(body.preferredDate, 10), preferred_time: str(body.preferredTime, 20)
      },
      payment_intent_data: { description: `Express Pathology home visit upgrade ${reference}`, metadata: { reference, order_type: 'ohc_home_upgrade' } }
    });
    return res.status(200).json({ url: session.url, reference });
  } catch (e) {
    console.error('home upgrade checkout failed:', e.message);
    if (e.code === 'not_configured') return res.status(503).json({ error: 'Online payment is being set up. Please call us on 02 9545 2940.' });
    return res.status(502).json({ error: 'We could not start checkout. Please call us on 02 9545 2940.' });
  }
}
