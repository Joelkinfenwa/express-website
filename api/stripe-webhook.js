// Stripe webhook: on a paid Checkout Session, emails the order to the Express team and a
// confirmation to the patient (via Resend). Configure in Stripe with the event
// checkout.session.completed (and checkout.session.async_payment_succeeded), and set
// STRIPE_WEBHOOK_SECRET in Vercel.
import { stripe, verifySignature } from '../lib/stripe.js';
import { findOrder } from '../lib/original-order.js';
import PRICES from '../lib/price-index.mjs';
import { requestFormPdf, orderFromSession } from '../lib/request-form.js';
import { patientEmail, homeUpgradePaidEmail, clinicOrderEmail } from '../lib/patient-email.js';
import { ETN } from '../lib/etn.mjs';
import { orderNumber } from '../lib/order-number.js';
import { klaviyoEvent } from '../lib/klaviyo.js';

export const config = { api: { bodyParser: false } };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => '$' + (c / 100).toFixed(2).replace(/\.00$/, '');

// Read the raw request stream before anything touches req.body (Vercel parses req.body lazily,
// which would consume the stream and break signature verification).
async function rawBody(req) {
  const chunks = [];
  if (typeof req[Symbol.asyncIterator] === 'function') for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return '';
}

async function send(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
}

// The pathology request form for panel and Build Your Own orders (not for own-form home visits).
export async function requestForm(s) {
  const m = s.metadata || {};
  if (m.order_type !== 'panel' && m.order_type !== 'builder') return null;
  const order = orderFromSession(s, PRICES);
  if (!order.items.length) throw new Error('no tests found for ' + m.reference);
  const bytes = await requestFormPdf(order);
  return { filename: `Pathology request form ${String(m.reference).replace('#', 'order ')}.pdf`, content: Buffer.from(bytes).toString('base64') };
}

// Add-on order: one updated request form under the original order number, listing the original
// tests plus the added ones, with a note that it replaces the earlier form
export async function addOnForm(s) {
  const m = s.metadata || {};
  const orig = await findOrder(m.addto);
  if (!orig) throw new Error('original order #' + m.addto + ' not found');
  const a = orderFromSession(orig.session, PRICES), b = orderFromSession(s, PRICES);
  const lines = [...new Set([...a.items.flatMap((i) => i.lines), ...b.items.flatMap((i) => i.lines)])];
  if (!lines.length) throw new Error('no tests found for add-on ' + m.reference);
  const order = { reference: '#' + m.addto, patient: a.patient, items: [{ title: 'Tests', lines }], fasting: a.fasting || b.fasting,
    notes: `Updated form: includes add-on order ${m.reference}. Replaces the earlier form for order #${m.addto}.` };
  const bytes = await requestFormPdf(order);
  return { filename: `Pathology request form order ${m.addto} (updated).pdf`, content: Buffer.from(bytes).toString('base64') };
}

export function emails(s, form = null, formError = '') {
  const m = s.metadata || {};
  const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
  const total = money(s.amount_total || 0);
  const items = String(m.items || '').split('; ').filter(Boolean);
  const rows = [
    ['Order', m.reference], ['Checkout reference', m.checkout_ref !== m.reference ? m.checkout_ref : ''], ['Items', items.join(', ')], ['Total paid', total], ['Collection', m.collection],
    ['Name', name], ['Date of birth', m.dob], ['Sex', m.sex], ['Email', s.customer_details && s.customer_details.email || s.customer_email],
    ['Phone', m.phone], ['Address', [m.address, m.suburb, m.state, m.postcode].filter(Boolean).join(', ')],
    ['Preferred date', m.preferred_date], ['Preferred time', m.preferred_time], ['Notes', m.notes], ['Came from', m.source || 'Not recorded'], ['Stripe session', s.id]
  ].filter(([, v]) => v);
  const toPatient = !!form; // the request form is always attached to the patient's confirmation email
  const team = {
    from: process.env.ENQUIRY_FROM,
    to: String(process.env.ENQUIRY_TO || '').split(',').map((x) => x.trim()).filter(Boolean),
    reply_to: s.customer_details && s.customer_details.email || s.customer_email,
    ...(form ? { attachments: [form] } : {}),
    subject: `New paid order ${m.reference}: ${items[0] || 'Order'}${items.length > 1 ? ` + ${items.length - 1} more` : ''} (${m.collection})`,
    html: `<p><strong>New paid order.</strong> ${m.order_type === 'own-form' ? 'Patient has their own doctor\'s request form. It follows in a separate email titled "Doctor\'s request form for paid order". If it has not arrived within a few minutes, ask the patient to reply with a photo of it. Book the nurse.' : (form ? `Pathology request form attached${toPatient ? ' (also emailed to the patient)' : '. Send it to the patient'}` : `Request form could not be generated${formError ? ' (' + esc(formError) + ')' : ''}. Issue it manually`) + (/^Home/.test(m.collection) ? ' and book the nurse.' : '.')}</p><table>${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5A645E">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>`
  };
  const pe = patientEmail(s, PRICES, { attached: toPatient });
  const patient = {
    from: process.env.ENQUIRY_FROM,
    to: [s.customer_details && s.customer_details.email || s.customer_email],
    reply_to: String(process.env.ENQUIRY_TO || '').split(',')[0].trim(),
    ...(toPatient ? { attachments: [form] } : {}),
    subject: pe.subject, html: pe.html, text: pe.text
  };
  return { team, patient };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const raw = await rawBody(req);
  if (!verifySignature(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).json({ error: 'Invalid signature' });
  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Invalid payload' }); }
  const s = event.data && event.data.object;
  const relevant = (event.type === 'checkout.session.completed' && s.payment_status === 'paid') || event.type === 'checkout.session.async_payment_succeeded';
  // Checkout started on the website but not paid within the hour: tell the team so they can follow up
  if (event.type === 'checkout.session.expired' && s && (s.metadata || {}).order_type && process.env.RESEND_API_KEY && process.env.ENQUIRY_FROM && process.env.ENQUIRY_TO) {
    const m = s.metadata;
    const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Unknown';
    const total = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format((s.amount_total || 0) / 100);
    const rows = [['Checkout reference', m.reference], ['Items', m.items], ['Total', total], ['Collection', m.collection], ['Name', name], ['Email', s.customer_email || (s.customer_details || {}).email], ['Phone', m.phone], ['Address', [m.address, m.suburb, m.state, m.postcode].filter(Boolean).join(', ')], ['Preferred date', m.preferred_date], ['Preferred time', m.preferred_time]];
    try {
      await send({ from: process.env.ENQUIRY_FROM, to: process.env.ENQUIRY_TO.split(',').map((x) => x.trim()).filter(Boolean), subject: `Payment not completed ${m.reference}: ${name} (${total})`,
        html: `<p><strong>This customer started checkout but did not pay.</strong> Call them to complete the booking, or send a payment link.</p><table>${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5A645E">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>` });
    } catch (e) { console.error('expired email failed:', e.message); return res.status(500).json({ error: 'Email failed' }); }
    return res.status(200).json({ received: true, expired: true });
  }
  if (!relevant) return res.status(200).json({ received: true, ignored: event.type });
  if (!process.env.RESEND_API_KEY || !process.env.ENQUIRY_FROM || !process.env.ENQUIRY_TO) { console.error('order email not configured'); return res.status(500).json({ error: 'Email not configured' }); }
  try {
    // Sequential order number replaces the checkout reference everywhere the customer or lab sees it
    const m = s.metadata = { ...(s.metadata || {}) };
    // Payments not made through the website checkout (for example a Stripe payment link sent by the
    // team): notify the team only, with no order number, request form or patient email
    if (!m.order_type) {
      const total = new Intl.NumberFormat('en-AU', { style: 'currency', currency: String(s.currency || 'aud').toUpperCase() }).format((s.amount_total || 0) / 100);
      const who = (s.customer_details && (s.customer_details.name || s.customer_details.email)) || 'unknown customer';
      await send({ from: process.env.ENQUIRY_FROM, to: process.env.ENQUIRY_TO.split(',').map((x) => x.trim()), subject: `Payment received (not a website order): ${total} from ${who}`,
        html: `<p>A payment was received outside the website checkout, for example through a Stripe payment link. No confirmation was sent to the customer.</p><p>Amount: ${esc(total)}<br>Customer: ${esc(who)}${s.customer_details && s.customer_details.email ? ' (' + esc(s.customer_details.email) + ')' : ''}<br>Stripe session: ${esc(s.id)}</p>` });
      return res.status(200).json({ received: true, external: true });
    }
    // Empowered Through Nutrition order (/empowered): client paid by card at checkout. Issue the
    // request form with the panel tests, email the team and the patient, and record the order so it
    // appears in /admin with a trackable stage.
    if (m.order_type === 'etn_order') {
      const panel = ETN.panels[m.panel];
      if (!panel) { console.error('etn_order with unknown panel:', m.panel); return res.status(200).json({ received: true }); }
      const home = m.collection === 'home';
      const pt = { firstName: m.first_name, lastName: m.last_name, email: s.customer_email || (s.customer_details || {}).email || '', phone: m.phone, dob: m.dob, sex: m.sex, address: m.address, suburb: m.suburb, state: m.state, postcode: m.postcode };
      const total = (s.amount_total || 0) / 100;
      const when = [m.preferred_date, m.preferred_time].filter(Boolean).join(', ');

      let form = null, formError = '';
      try {
        const bytes = await requestFormPdf({
          reference: m.reference, patient: pt,
          items: [{ title: `${panel.n} — Empowered Through Nutrition`, lines: panel.lines }],
          fasting: !!panel.fasting,
          notes: 'Empowered Through Nutrition order — paid in full at checkout. Results are reviewed and shared with the Empowered Through Nutrition coaching team.'
        });
        form = { filename: `Pathology request form ${m.reference}.pdf`, content: Buffer.from(bytes).toString('base64') };
      } catch (e) { formError = e.message; console.error('etn request form failed:', e.message); }

      const rows = [['Order', m.reference], ['Clinic', ETN.clinic], ['Panel', `${panel.n} — $${panel.p} incl. GST`],
        ['Collection', home ? `Home visit (+$${ETN.homeFee}) — contact the patient within 4 hours to confirm the time` : 'Collection centre'],
        ['Preferred', home ? (when || 'No preference') : ''], ['Paid', `$${total.toFixed(2)} incl. GST (Stripe)`],
        ['Patient', `${pt.firstName} ${pt.lastName}`], ['DOB', pt.dob], ['Sex', pt.sex], ['Email', pt.email], ['Phone', pt.phone],
        ['Address', [pt.address, pt.suburb, pt.state, pt.postcode].filter(Boolean).join(', ')]];
      await send({
        from: process.env.ENQUIRY_FROM, to: process.env.ENQUIRY_TO.split(',').map((x) => x.trim()),
        subject: `ETN ORDER ${m.reference} (PAID): ${pt.firstName} ${pt.lastName} — ${panel.n} — ${home ? 'Home visit ' + pt.postcode : 'Collection centre'}`,
        html: `<table>${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5A645E">${esc(k)}</td><td style="padding:4px 0">${esc(String(v))}</td></tr>`).join('')}</table>` + (form
          ? '<p>The pathology request form is attached and has been emailed to the patient.</p>'
          : `<p style="color:#B3261E"><strong>Request form generation failed (${esc(formError)}) — generate and send it manually.</strong></p>`),
        ...(form ? { attachments: [form] } : {})
      });

      if (pt.email) {
        try {
          const pe = clinicOrderEmail({ reference: m.reference, clinic: ETN.clinic, firstName: pt.firstName, state: pt.state, preferredDate: m.preferred_date, preferredTime: m.preferred_time, address: pt.address, suburb: pt.suburb, postcode: pt.postcode, tests: panel.lines, home, attached: !!form, paid: true });
          await send({ from: process.env.ENQUIRY_FROM, to: [pt.email], reply_to: process.env.ENQUIRY_TO.split(',')[0], subject: pe.subject, html: pe.html, text: pe.text, ...(form ? { attachments: [form] } : {}) });
        } catch (e) { console.error('etn patient email failed:', e.message); }
      }

      try {
        await stripe('POST', '/customers', {
          description: `ETN order ${m.reference} (${pt.firstName} ${pt.lastName})`, email: pt.email,
          metadata: {
            type: 'clinic_order', partner: ETN.partner, reference: m.reference,
            patient: `${pt.firstName} ${pt.lastName}`.slice(0, 120), email: pt.email, phone: pt.phone, dob: pt.dob, sex: pt.sex,
            items: `${panel.n} (paid)`, tests: panel.lines.join('; ').slice(0, 480),
            collection: home ? 'Home visit' : 'Collection centre', preferred: when,
            total: String(total), address: [pt.address, pt.suburb, pt.state, pt.postcode].filter(Boolean).join(', ').slice(0, 480),
            ops_stage: 'form_sent'
          }
        });
      } catch (e) { console.error('etn order record failed:', e.message); }
      return res.status(200).json({ received: true, etn: true });
    }
    // Home visit upgrade on a clinic order (/optimal-home): notify the team, confirm to the
    // patient, and mark the clinic order record. No request form or order number is involved.
    if (m.order_type === 'ohc_home_upgrade') {
      const name = [m.first_name, m.last_name].filter(Boolean).join(' ');
      const when = [m.preferred_date, m.preferred_time].filter(Boolean).join(', ');
      const addr = [m.address, m.suburb, m.state, m.postcode].filter(Boolean).join(', ');
      const rows = [['Order', m.reference], ['Patient', name], ['Phone', m.phone], ['Email', s.customer_email || (s.customer_details || {}).email], ['Address', addr], ['Preferred', when || 'No preference'], ['Paid', '$75.00 home visit fee']];
      await send({ from: process.env.ENQUIRY_FROM, to: process.env.ENQUIRY_TO.split(',').map((x) => x.trim()),
        subject: `OHC HOME UPGRADE PAID ${m.reference}: ${name} — book the visit (${m.postcode})`,
        html: `<p><strong>This patient paid $75 to upgrade their clinic order to a home visit.</strong> Contact them within 4 hours to confirm the time, and assign a nurse.</p><table>${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5A645E">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>` });
      const pe = homeUpgradePaidEmail({ reference: m.reference, firstName: m.first_name, preferredDate: m.preferred_date, preferredTime: m.preferred_time, address: m.address, suburb: m.suburb, state: m.state, postcode: m.postcode });
      const to = s.customer_email || (s.customer_details || {}).email;
      if (to) await send({ from: process.env.ENQUIRY_FROM, to: [to], reply_to: process.env.ENQUIRY_TO.split(',')[0], subject: pe.subject, html: pe.html, text: pe.text }).catch((e) => console.error('upgrade patient email failed:', e.message));
      try {
        const found = await stripe('GET', `/customers/search?query=${encodeURIComponent(`metadata['type']:'clinic_order' AND metadata['reference']:'${m.reference}'`)}`);
        const c = (found.data || [])[0];
        if (c) await stripe('POST', `/customers/${c.id}`, { metadata: { collection: 'Home visit (upgraded, $75 paid)', preferred: when || c.metadata.preferred || '', ops_note: `${c.metadata.ops_note || ''} Home upgrade paid ${new Date().toISOString().slice(0, 10)}.`.trim().slice(0, 480) } });
      } catch (e) { console.error('clinic order upgrade update failed:', e.message); }
      return res.status(200).json({ received: true, upgrade: true });
    }
    m.checkout_ref = m.reference;
    try { m.reference = '#' + await orderNumber(s); } catch (e) { console.error('order number failed:', e.message); }
    let form = null, formError = '';
    try { form = m.addto ? await addOnForm(s) : await requestForm(s); } catch (e) { formError = e.message; console.error('request form failed:', e.message); }
    const { team, patient } = emails(s, form, formError);
    if (m.addto && form) {
      patient.subject = `Here is your updated pathology request form (Order #${m.addto})`;
      team.subject = `New paid add-on ${m.reference} to order #${m.addto}: ${String(m.items || '').split('; ')[0]}`;
      team.html = `<p><strong>Add-on to order #${esc(m.addto)}.</strong> An updated request form for order #${esc(m.addto)} with the original and added tests is attached and has been emailed to the patient. It replaces the earlier form.</p>` + team.html;
    }
    await send(team);
    if (patient.to[0]) await send(patient).catch((e) => console.error('patient email failed:', e.message));
    // Tell Klaviyo the order is paid so follow-up flows stop (no-op without KLAVIYO_PRIVATE_KEY)
    await klaviyoEvent('Placed Website Order', { email: patient.to[0], firstName: m.first_name, lastName: m.last_name },
      { reference: m.reference, order_type: m.order_type, panel: m.panel || '', collection: m.collection || '', offer: m.offer || '' }, (s.amount_total || 0) / 100)
      .catch((e) => console.error('klaviyo order failed:', e.message));
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('order email failed:', e.message);
    return res.status(500).json({ error: 'Email failed' }); // Stripe will retry
  }
}
