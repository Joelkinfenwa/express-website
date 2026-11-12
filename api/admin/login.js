// Emails a sign-in link for the orders tracker to an approved address (ADMIN_EMAILS).
import { allowedEmails, signToken } from '../../lib/admin-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const email = String((body || {}).email || '').trim().toLowerCase();
  // Same answer whether or not the address is approved
  if (allowedEmails().includes(email) && process.env.RESEND_API_KEY && process.env.ENQUIRY_FROM) {
    const site = (process.env.SITE_URL || 'https://expresspathology.com.au').replace(/\/$/, '');
    const link = `${site}/admin?t=${encodeURIComponent(signToken(email))}`;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.ENQUIRY_FROM, to: [email], subject: 'Your sign-in link for the Express orders tracker',
        html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1C2420;font-size:15px;line-height:1.55"><p>Use the button below to sign in to the Express orders tracker. The link stays signed in on this device for 30 days.</p><p><a href="${link}" style="display:inline-block;background:#17302A;color:#F7F4EF;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Open the orders tracker</a></p><p style="color:#5A645E;font-size:13px">If you did not ask for this, you can ignore this email.</p></div>`,
        text: `Sign in to the Express orders tracker: ${link}` })
    }).catch(() => null);
    if (!r || !r.ok) console.error('admin login email failed', r && r.status);
  }
  return res.status(200).json({ ok: true });
}
