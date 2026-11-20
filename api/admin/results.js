// Emails a Primal Zone patient their results PDF from the orders tracker, then marks the order "Sent to patient".
// The recipient is always the email on the Shopify order (never taken from the browser), and only Primal Zone
// orders can be sent. Files are attached to the email and not stored anywhere else.
import { verify } from '../../lib/admin-auth.js';
import { shopifyConfigured, shopifyGraphQL } from '../../lib/shopify-admin.js';
import { saveShopify } from './orders.js';

const MAX_BYTES = 3 * 1024 * 1024; // Vercel's request limit is 4.5 MB, and base64 adds a third
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function findOrder(id) {
  const d = await shopifyGraphQL(`query($id: ID!) { order(id: $id) { id name email tags note sourceName
    customer { firstName email } billingAddress { firstName } shippingAddress { firstName }
    lineItems(first: 40) { nodes { title } } } }`, { id });
  return d.order;
}

function message(first) {
  const hi = first ? `Hi ${first},` : 'Hi,';
  const text = `${hi}\n\nPlease see your attached Primal Zone results. Please upload these to your Primal Zone portal.\n\nExpress Pathology`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F4EF;font-family:Helvetica,Arial,sans-serif;color:#1C2420">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EF"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;border:1px solid #DCE0D8">
<tr><td style="padding:32px 32px 8px;font-size:20px;font-weight:700">express<span style="color:#A4502E">.</span> <span style="font-weight:400;color:#4B5650">pathology</span></td></tr>
<tr><td style="padding:8px 32px 32px;font-size:16px;line-height:1.6">
<p style="margin:0 0 16px">${esc(hi)}</p>
<p style="margin:0 0 16px">Please see your attached Primal Zone results. Please upload these to your Primal Zone portal.</p>
<p style="margin:0">Express Pathology</p>
</td></tr></table>
</td></tr></table></body></html>`;
  return { text, html };
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
    const { text, html } = message(first);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.ENQUIRY_FROM, to: [to], reply_to: String(process.env.ENQUIRY_TO || '').split(',')[0].trim() || undefined, subject: `Your Primal Zone results (Order ${o.name})`, html, text, attachments })
    });
    if (!r.ok) { console.error('results email failed', r.status, (await r.text()).slice(0, 200)); return res.status(502).json({ error: 'The email did not send. Try again.' }); }
    const now = new Date().toISOString();
    await saveShopify(id, { stage: 'sent', results_sent: `${now}|${who}|${to}`, updated: `${now}|${who}` });
    return res.status(200).json({ ok: true, to, updated: now, by: who });
  } catch (e) {
    console.error('results send failed:', e.message);
    return res.status(500).json({ error: 'Could not send the results. Try again.' });
  }
}
