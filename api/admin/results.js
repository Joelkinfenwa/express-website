// Emails a Primal Zone patient their results PDF from the orders tracker, then marks the order "Sent to patient".
// The recipient is always the email on the Shopify order (never taken from the browser), and only Primal Zone
// orders can be sent. Files are attached to the email and not stored anywhere else.
import { verify } from '../../lib/admin-auth.js';
import { shopifyConfigured, shopifyGraphQL } from '../../lib/shopify-admin.js';
import { saveShopify } from './orders.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const MAX_BYTES = 3 * 1024 * 1024; // Vercel's request limit is 4.5 MB, and base64 adds a third
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function findOrder(id) {
  const d = await shopifyGraphQL(`query($id: ID!) { order(id: $id) { id name email tags note sourceName
    customer { firstName email } billingAddress { firstName } shippingAddress { firstName }
    lineItems(first: 40) { nodes { title } } } }`, { id });
  return d.order;
}

// Plain email: no images, cards or branding, just the message and the attached PDF
function message(first) {
  const hi = first ? `Hi ${first},` : 'Hi,';
  const text = `${hi}\n\nPlease see your attached Primal Zone results. Please upload these to your Primal Zone portal.\n\nKind regards,\nExpress Pathology`;
  const html = `<p>${esc(hi)}</p><p>Please see your attached Primal Zone results. Please upload these to your Primal Zone portal.</p><p>Kind regards,<br>Express Pathology</p>`;
  return { text, html };
}

// Sends from results@ (RESULTS_FROM can override it). If that address is refused, it falls back to the usual sender.
// express@ is always copied in, and replies go to express@.
const OFFICE = 'express@expresspathology.com.au';
async function sendResults(to, subject, first, attachments) {
  const { text, html } = message(first);
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
const subjectFor = (order) => `PRIMAL ZONE BLOOD RESULTS - Order ${order}`;

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
  if (!shopifyConfigured()) return res.status(500).json({ error: 'Shopify is not connected.' });
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
  const id = String(b.id || '');
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(id)) return res.status(400).json({ error: 'Unknown order.' });
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
    attachments.push({ filename: name, content: buf.toString('base64') });
  }
  if (total > MAX_BYTES) return res.status(400).json({ error: 'The files are over 3 MB together. Send them one at a time.' });
  try {
    const o = await findOrder(id);
    if (!o) return res.status(404).json({ error: 'Order not found in Shopify.' });
    const titles = o.lineItems.nodes.map((x) => x.title);
    if (!/primal/i.test([o.tags.join(' '), o.sourceName, titles.join(' '), o.note].join(' '))) return res.status(400).json({ error: 'Results emails are only set up for Primal Zone orders.' });
    const to = String((o.customer && o.customer.email) || o.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'This order has no patient email in Shopify.' });
    if (b.confirm_to && String(b.confirm_to).toLowerCase() !== to.toLowerCase()) return res.status(409).json({ error: 'The email on the Shopify order has changed. Reload and check before sending.' });
    const first = (o.customer && o.customer.firstName) || (o.billingAddress && o.billingAddress.firstName) || (o.shippingAddress && o.shippingAddress.firstName) || '';
    const sent = await sendResults(to, subjectFor(o.name), first, attachments);
    if (!sent.ok) return res.status(502).json({ error: 'The email did not send. Try again.' });
    const now = new Date().toISOString();
    await saveShopify(id, { stage: 'sent', results_sent: `${now}|${who}|${to}`, updated: `${now}|${who}` });
    return res.status(200).json({ ok: true, to, from: sent.from, updated: now, by: who });
  } catch (e) {
    console.error('results send failed:', e.message);
    return res.status(500).json({ error: 'Could not send the results. Try again.' });
  }
}
