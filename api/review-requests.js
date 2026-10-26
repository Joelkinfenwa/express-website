// Daily review request (Vercel cron). Emails customers whose website order was paid 4 to 7 days ago
// and asks for an honest Google review. No incentive is offered. Inactive until GOOGLE_REVIEW_URL is set.
// Each order is asked once: the PaymentIntent is marked with metadata.review_sent. Refunded orders are skipped.
import { stripe } from '../lib/stripe.js';

const DAY = 86400;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function authorised(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.authorization === `Bearer ${secret}`;
  return /vercel-cron/i.test(String(req.headers['user-agent'] || ''));
}

function message(first, url) {
  const hi = first ? `Hi ${esc(first)},` : 'Hello,';
  const text = `${first ? `Hi ${first},` : 'Hello,'}\n\nThank you for choosing Express Pathology for your recent blood collection.\n\nIf you have a minute, we would value an honest review of your experience on Google. It helps other people find a nurse who comes to them, and it tells our team what to keep doing and what to improve.\n\nLeave a review: ${url}\n\nIf anything about your visit was not right, reply to this email and our team will look into it.\n\nExpress Pathology`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F4EF;font-family:Helvetica,Arial,sans-serif;color:#1C2420">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EF"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;border:1px solid #DCE0D8">
<tr><td style="padding:32px 32px 8px;font-size:20px;font-weight:700">express<span style="color:#A4502E">.</span> <span style="font-weight:400;color:#4B5650">pathology</span></td></tr>
<tr><td style="padding:8px 32px 0;font-size:16px;line-height:1.6">
<p style="margin:0 0 16px">${hi}</p>
<p style="margin:0 0 16px">Thank you for choosing Express Pathology for your recent blood collection.</p>
<p style="margin:0 0 24px">If you have a minute, we would value an honest review of your experience on Google. It helps other people find a nurse who comes to them, and it tells our team what to keep doing and what to improve.</p>
<p style="margin:0 0 28px"><a href="${esc(url)}" style="display:inline-block;background:#17302A;color:#F7F4EF;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px">Leave a Google review</a></p>
<p style="margin:0 0 32px;color:#4B5650">If anything about your visit was not right, reply to this email and our team will look into it.</p>
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#6B756F">Express Pathology · expresspathology.com.au</p>
</td></tr></table></body></html>`;
  return { text, html };
}

export default async function handler(req, res) {
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised' });
  const url = process.env.GOOGLE_REVIEW_URL;
  if (!url) return res.status(200).json({ skipped: 'GOOGLE_REVIEW_URL not set' });
  if (!process.env.RESEND_API_KEY || !process.env.ENQUIRY_FROM) return res.status(500).json({ error: 'Email not configured' });
  const now = Math.floor(Date.now() / 1000);
  const q = `limit=100&status=complete&created[gte]=${now - 7 * DAY}&created[lte]=${now - 4 * DAY}&expand[]=data.payment_intent.latest_charge`;
  let sent = 0, skipped = 0;
  try {
    const list = await stripe('GET', `/checkout/sessions?${q}`);
    for (const s of list.data || []) {
      const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
      const m = s.metadata || {};
      const email = (s.customer_details && s.customer_details.email) || s.customer_email;
      const charge = pi && pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
      if (s.payment_status !== 'paid' || !m.order_type || !pi || !email || (pi.metadata || {}).review_sent || (charge && (charge.refunded || charge.amount_refunded > 0))) { skipped++; continue; }
      const { text, html } = message(m.first_name || '', url);
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.ENQUIRY_FROM, to: [email], reply_to: String(process.env.ENQUIRY_TO || '').split(',')[0].trim() || undefined, subject: 'How was your visit with Express Pathology?', html, text })
      });
      if (!r.ok) { console.error('review email failed', r.status); continue; }
      await stripe('POST', `/payment_intents/${pi.id}`, { metadata: { review_sent: new Date().toISOString().slice(0, 10) } });
      sent++;
    }
    return res.status(200).json({ sent, skipped });
  } catch (e) {
    console.error('review requests failed:', e.message);
    return res.status(500).json({ error: 'failed' });
  }
}
