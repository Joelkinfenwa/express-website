// Emails a patient their results from the orders tracker, then marks the order "Sent to patient".
// Primal Zone (Shopify order): the lab results PDF. Express private tests (Stripe): two PDFs, the lab results
// and Jai's report, both required. The recipient is always the email on the order (never taken from the browser).
// Files are attached to the email and not stored anywhere else.
import { verify } from '../../lib/admin-auth.js';
import { shopifyConfigured, shopifyGraphQL } from '../../lib/shopify-admin.js';
import { saveShopify, fromSession } from './orders.js';
import { stripe } from '../../lib/stripe.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const MAX_BYTES = 3 * 1024 * 1024; // Vercel's request limit is 4.5 MB, and base64 adds a third
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function findOrder(id) {
  const d = await shopifyGraphQL(`query($id: ID!) { order(id: $id) { id name email tags note sourceName
    billingAddress { firstName } shippingAddress { firstName }
    lineItems(first: 40) { nodes { title } } } }`, { id });
  return d.order;
}

// Plain email: no images, cards or branding, just the message and the attached PDF
const BODY = {
  pz: 'Please see your attached Primal Zone results. Please upload these to your Primal Zone portal.',
  ep: 'Please see your attached blood test results, along with your results report.'
};
function message(first, kind = 'pz') {
  const hi = first ? `Hi ${first},` : 'Hi,';
  const text = `${hi}\n\n${BODY[kind]}\n\nKind regards,\nExpress Pathology`;
  const html = `<p>${esc(hi)}</p><p>${esc(BODY[kind])}</p><p>Kind regards,<br>Express Pathology</p>`;
  return { text, html };
}

// Sends from results@ (RESULTS_FROM can override it). If that address is refused, it falls back to the usual sender.
// express@ is always copied in, and replies go to express@.
const OFFICE = 'express@expresspathology.com.au';
async function sendResults(to, subject, first, attachments, kind = 'pz') {
  const { text, html } = message(first, kind);
  const froms = [process.env.RESULTS_FROM || 'Express Pathology <results@expresspathology.com.au>', process.env.ENQUIRY_FROM].filter(Boolean);
  let last = '';
  for (const from of froms) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], cc: to.toLowerCase() === OFFICE ? undefined : [OFFICE], reply_to: OFFICE, subject, html, text, attachments })
    });
    if (r.ok) return { ok: true, from };
    last = `${r.status} ${(await r.text()).slice(0, 200)}`;
    console.error('results email failed from', from, last);
    if (r.status !== 403 && r.status !== 422) break; // only retry when the sender address itself was refused
  }
  return { ok: false, error: last };
}
const subjectFor = (order, kind = 'pz') => `${kind === 'ep' ? 'EXPRESS PATHOLOGY' : 'PRIMAL ZONE'} BLOOD RESULTS - Order ${order}`;

// A clearly marked sample report, used for the "Send me a test" button
async function samplePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.14, 0.13), soft = rgb(0.4, 0.44, 0.42), red = rgb(0.64, 0.31, 0.18);
  page.drawText('SAMPLE REPORT - NOT A REAL RESULT', { x: 50, y: 790, size: 16, font: bold, color: red });
  page.drawText('Primal Zone panel - test email from the Express orders tracker', { x: 50, y: 766, size: 11, font, color: soft });
  page.drawText('Patient: Tom Sample    Order: #TEST', { x: 50, y: 740, size: 11, font, color: ink });
  const tests = ['Free & total testosterone', 'Oestradiol (E2) & SHBG', 'Liver function (LFT)', 'Kidney function (UEC)', 'Magnesium', 'Lipids (Chol, TG, HDL, LDL)', 'Glucose', 'High-sensitivity CRP', 'Full blood count', 'FSH / LH, prolactin, progesterone', 'DHEAS & cortisol', 'Thyroid (TSH, FT3, FT4)', 'Iron studies', 'Insulin'];
  tests.forEach((t, i) => { const y = 700 - i * 26; page.drawText(t, { x: 50, y, size: 11, font, color: ink }); page.drawText('sample only', { x: 400, y, size: 11, font, color: soft }); });
  page.drawText('The real email attaches the lab report PDF you upload in the tracker.', { x: 50, y: 300, size: 10, font, color: soft });
  return Buffer.from(await doc.save());
}

export default async function handler(req, res) {
  const who = verify(req);
  if (!who) return res.status(401).json({ error: 'Please sign in again.' });
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.RESEND_API_KEY || !process.env.ENQUIRY_FROM) return res.status(500).json({ error: 'Email is not configured.' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  if (b.test === true) {
    try {
      const sent = await sendResults(who, subjectFor('#TEST'), 'Tom', [{ filename: 'Sample-Primal-Zone-results.pdf', content: (await samplePdf()).toString('base64') }]);
      if (!sent.ok) return res.status(502).json({ error: 'The test email did not send.' });
      return res.status(200).json({ ok: true, to: who, from: sent.from });
    } catch (e) { console.error('test results failed:', e.message); return res.status(500).json({ error: 'The test email did not send.' }); }
  }
  // Kill switch: set RESULTS_EMAIL_DISABLED=1 in Vercel to stop all patient results emails
  if (process.env.RESULTS_EMAIL_DISABLED === '1') return res.status(403).json({ error: 'Results emails to patients are switched off.' });
  const id = String(b.id || '');
  const isEP = /^pi_\w+$/.test(id);
  if (!isEP && !/^gid:\/\/shopify\/Order\/\d+$/.test(id)) return res.status(400).json({ error: 'Unknown order.' });
  if (!isEP && !shopifyConfigured()) return res.status(500).json({ error: 'Shopify is not connected.' });
  const files = Array.isArray(b.files) ? b.files.slice(0, 5) : [];
  if (!files.length) return res.status(400).json({ error: 'Choose the results PDF first.' });
  let total = 0;
  const attachments = [];
  for (const f of files) {
    const name = String(f.name || 'results.pdf').replace(/[^\w .()-]/g, '').slice(0, 80) || 'results.pdf';
    const data = String(f.data || '').replace(/^data:[^,]*,/, '');
    const buf = Buffer.from(data, 'base64');
    if (!/\.pdf$/i.test(name) || buf.subarray(0, 4).toString() !== '%PDF') return res.status(400).json({ error: `${name} is not a PDF.` });
    total += buf.length;
    attachments.push({ filename: name, content: buf.toString('base64'), role: String(f.role || '') });
  }
  // Express orders need both the lab results and Jai's report before anything is sent
  if (isEP && !(attachments.some((a) => a.role === 'lab') && attachments.some((a) => a.role === 'report'))) return res.status(400).json({ error: "Add both PDFs: the lab results and Jai's report." });
  attachments.forEach((a) => delete a.role);
  if (total > MAX_BYTES) return res.status(400).json({ error: 'The files are over 3 MB together. Send them one at a time.' });
  if (isEP) return sendExpress(req, res, b, id, who, attachments);
  try {
    const o = await findOrder(id);
    if (!o) return res.status(404).json({ error: 'Order not found in Shopify.' });
    const titles = o.lineItems.nodes.map((x) => x.title);
    if (!/primal/i.test([o.tags.join(' '), o.sourceName, titles.join(' '), o.note].join(' '))) return res.status(400).json({ error: 'Results emails are only set up for Primal Zone orders.' });
    const to = String(o.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'This order has no patient email in Shopify.' });
    if (b.confirm_to && String(b.confirm_to).toLowerCase() !== to.toLowerCase()) return res.status(409).json({ error: 'The email on the Shopify order has changed. Reload and check before sending.' });
    const first = (o.billingAddress && o.billingAddress.firstName) || (o.shippingAddress && o.shippingAddress.firstName) || '';
    const sent = await sendResults(to, subjectFor(o.name), first, attachments);
    if (!sent.ok) return res.status(502).json({ error: 'The email did not send. Try again.' });
    const now = new Date().toISOString();
    // The email has gone at this point, so a failed save must not show as a failed send (that would invite a second send)
    try { await saveShopify(id, { stage: 'sent', results_sent: `${now}|${who}|${to}`, updated: `${now}|${who}` }); }
    catch (e) { console.error('results sent but stage save failed:', e.message); return res.status(200).json({ ok: true, to, from: sent.from, updated: now, by: who, warning: 'Sent, but the stage did not save. Set it to Sent to patient.' }); }
    return res.status(200).json({ ok: true, to, from: sent.from, updated: now, by: who });
  } catch (e) {
    console.error('results send failed:', e.message);
    return res.status(500).json({ error: 'Could not send the results (' + String(e.message || '').slice(0, 120) + '). Nothing was emailed.' });
  }
}

// Express private tests: the order is the Stripe checkout behind the PaymentIntent
async function sendExpress(req, res, b, id, who, attachments) {
  try {
    const list = await stripe('GET', `/checkout/sessions?payment_intent=${id}&expand[]=data.payment_intent.latest_charge`);
    const s = (list.data || [])[0];
    const o = s && fromSession(s);
    if (!o) return res.status(404).json({ error: 'Order not found in Stripe.' });
    if (o.type === 'own-form') return res.status(400).json({ error: "Results for doctor's request form orders go to the patient's own doctor." });
    const to = String(o.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'This order has no patient email.' });
    if (b.confirm_to && String(b.confirm_to).toLowerCase() !== to.toLowerCase()) return res.status(409).json({ error: 'The email on the order has changed. Reload and check before sending.' });
    const first = String(o.name || '').split(' ')[0];
    const sent = await sendResults(to, subjectFor(o.order, 'ep'), first, attachments, 'ep');
    if (!sent.ok) return res.status(502).json({ error: 'The email did not send. Try again.' });
    const now = new Date().toISOString();
    try { await stripe('POST', `/payment_intents/${id}`, { metadata: { ops_stage: 'sent', ops_results_sent: `${now}|${who}|${to}`, ops_updated: `${now}|${who}` } }); }
    catch (e) { console.error('results sent but stage save failed:', e.message); return res.status(200).json({ ok: true, to, from: sent.from, updated: now, by: who, warning: 'Sent, but the stage did not save. Set it to Sent to patient.' }); }
    return res.status(200).json({ ok: true, to, from: sent.from, updated: now, by: who });
  } catch (e) {
    console.error('express results send failed:', e.message);
    return res.status(500).json({ error: 'Could not send the results (' + String(e.message || '').slice(0, 120) + '). Nothing was emailed.' });
  }
}
