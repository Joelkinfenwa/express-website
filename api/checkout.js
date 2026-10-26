// Creates a Stripe Checkout Session for a panel, a Build Your Own order, or a home visit with the
// patient's own doctor's request form. Prices come only from lib/price-index.mjs (generated at
// build time), never from the browser.
import PRICES from '../lib/price-index.mjs';
import { stripe } from '../lib/stripe.js';

const ALLOWED_ORIGIN = /^https:\/\/((www\.)?expresspathology\.com\.au|[a-z0-9-]+\.vercel\.app)$|^http:\/\/localhost(:\d+)?$/;
const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'];
const SEXES = ['Female', 'Male', 'Other'];
const cents = (n) => Math.round(n * 100);
const str = (v, max = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function area(pc) { return PRICES.metro.includes(pc) ? 'metro' : PRICES.regional.includes(pc) ? 'regional' : null; }
// Payment is always taken. Outside the listed area, price by metro or regional classification.
function feeArea(pc) { return area(pc) || ((PRICES.metroAll || []).includes(pc) ? 'metro' : 'regional'); }
function makeRef() { return 'EP-' + Date.now().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase(); }

function validatePatient(p, type) {
  const d = {
    firstName: str(p.firstName, 60), lastName: str(p.lastName, 60), email: str(p.email, 160).toLowerCase(),
    phone: str(p.phone, 30), dob: str(p.dob, 10), sex: str(p.sex, 10),
    address: str(p.address, 160), suburb: str(p.suburb, 60), state: str(p.state, 3).toUpperCase(), postcode: str(p.postcode, 4)
  };
  if (!d.firstName || !d.lastName) return { error: 'Please enter your first and last name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return { error: 'Please enter a valid email address.' };
  if (d.phone.replace(/\D/g, '').length < 8) return { error: 'Please enter a valid phone number.' };
  if (!/^\d{4}$/.test(d.postcode)) return { error: 'Please enter a 4-digit postcode.' };
  if (type !== 'own-form') {
    const t = Date.parse(d.dob);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dob) || !t || t > Date.now() || t < Date.parse('1900-01-01')) return { error: 'Please enter a valid date of birth.' };
    if (!SEXES.includes(d.sex)) return { error: 'Please select sex.' };
    if (!d.address || !d.suburb) return { error: 'Please enter your street address and suburb.' };
    if (!STATES.includes(d.state)) return { error: 'Please select your state.' };
  }
  return { patient: d };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const type = str(body.type, 12);
  if (!['panel', 'builder', 'own-form'].includes(type)) return res.status(400).json({ error: 'Unknown order type.' });

  const v = validatePatient(body.patient || {}, type);
  if (v.error) return res.status(400).json({ error: v.error, code: 'invalid' });
  const p = v.patient;
  const home = type === 'own-form' || body.home === true;
  const listed = !!area(p.postcode);
  const where = feeArea(p.postcode);

  // Build line items from server-side prices only
  const items = [];
  const add = (name, price, description) => items.push({ name, price, description });
  if (type === 'panel') {
    const panel = PRICES.panels[str(body.panel, 80)];
    if (!panel) return res.status(400).json({ error: 'That test is no longer available.' });
    add(panel.title, panel.price, 'Private blood test panel. Pathology request form included.');
  } else if (type === 'builder') {
    const slugs = [...new Set((Array.isArray(body.tests) ? body.tests : []).map((s) => str(s, 60)))].slice(0, 60);
    const chosen = slugs.map((s) => PRICES.addons[s]).filter(Boolean);
    if (!chosen.length) return res.status(400).json({ error: 'Please choose at least one test.' });
    if (PRICES.builderFee) add('Build your own test fee', PRICES.builderFee, 'Combines your chosen tests into one collection and one report.');
    for (const t of chosen) add(t.title, t.price);
  } else {
    add(`Home visit with your doctor's request form (${where})`, PRICES.ownForm[where], 'A registered nurse collects at your home or workplace.');
  }
  if (home && type !== 'own-form') {
    if (PRICES.homeVisit == null) return res.status(400).json({ error: 'Home visits are not available online right now. Please contact us.' });
    add('Home visit', PRICES.homeVisit, 'A registered nurse collects at your home or workplace.');
  }

  const reference = type === 'own-form' && /^EP-[A-Z0-9]{4,10}$/.test(str(body.reference, 16)) ? str(body.reference, 16) : makeRef();
  const origin = ALLOWED_ORIGIN.test(String(req.headers.origin || '')) ? req.headers.origin : (process.env.SITE_URL || 'https://expresspathology.com.au').replace(/\/$/, '');
  const summary = items.map((i) => i.name).join('; ').slice(0, 480);
  const metadata = {
    reference, order_type: type, items: summary, collection: home ? `Home visit (${where}${listed ? '' : ', outside listed area: confirm nurse'})` : 'Collection centre',
    first_name: p.firstName, last_name: p.lastName, dob: p.dob, sex: p.sex, phone: p.phone,
    address: p.address, suburb: p.suburb, state: p.state, postcode: p.postcode,
    preferred_date: str(body.preferredDate, 10), preferred_time: str(body.preferredTime, 40), notes: str(body.notes, 480)
  };
  // What to print on the pathology request form (Stripe metadata values are limited to 500 characters)
  if (type === 'panel') metadata.panel = str(body.panel, 80);
  if (type === 'builder') {
    const slugs = Object.keys(PRICES.addons).filter((s) => items.some((i) => i.name === PRICES.addons[s].title));
    let chunk = '', n = 1;
    for (const s of slugs) {
      if ((chunk + ',' + s).length > 480) { metadata[n === 1 ? 'tests' : `tests_${n}`] = chunk; chunk = ''; n++; }
      chunk = chunk ? chunk + ',' + s : s;
    }
    if (chunk) metadata[n === 1 ? 'tests' : `tests_${n}`] = chunk;
  }

  try {
    const session = await stripe('POST', '/checkout/sessions', {
      mode: 'payment',
      // Unpaid sessions expire after an hour so the team is told promptly (checkout.session.expired)
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      customer_email: p.email,
      client_reference_id: reference,
      success_url: `${origin}/order-confirmed?ref=${encodeURIComponent(reference)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${type === 'panel' ? '/tests/' + encodeURIComponent(str(body.panel, 80)) : type === 'builder' ? '/tests#build' : '/book'}`,
      line_items: items.map((i) => ({ quantity: 1, price_data: { currency: 'aud', unit_amount: cents(i.price), product_data: { name: i.name, ...(i.description ? { description: i.description } : {}) } } })),
      metadata,
      payment_intent_data: { description: `Express Pathology ${reference}`, metadata: { reference, order_type: type } }
    });
    return res.status(200).json({ url: session.url, reference });
  } catch (e) {
    console.error('checkout failed:', e.message);
    if (e.code === 'not_configured') return res.status(503).json({ error: 'Online payment is being set up. Please call us on 02 9545 2940 to order.' });
    return res.status(502).json({ error: 'We could not start checkout', detail: String(e.message || 'stripe').replace(/sk_[A-Za-z0-9_]+/g, '').slice(0, 120) });
  }
}
