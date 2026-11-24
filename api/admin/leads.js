// B2B leads for the orders tracker: list, add, update, and import past website enquiries from the Resend email log.
import { verify } from '../../lib/admin-auth.js';
import { stripe } from '../../lib/stripe.js';
import { LEAD_STAGES, createLead, listLeads } from '../../lib/leads.js';
import { allCustomers } from '../../lib/order-number.js';

const LEAD_SUBJECT = /^(Partner enquiry:|Website enquiry: Partnerships)/i;
// Resend dates look like '2026-11-10 01:02:03.000+00'
function when(v) { const t = Date.parse(String(v || '').replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')); return new Date(isNaN(t) ? Date.now() : t).toISOString(); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unesc = (s) => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();

async function resend(path) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch('https://api.resend.com' + path, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
    if (r.status === 429) { await sleep(1200); continue; } // Resend allows about two requests a second
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(j.message || j.name || '').slice(0, 120)}`);
    return j;
  }
  throw new Error('Resend is busy. Try again in a minute.');
}

// The team email is a two-column table of form field names and values
function fieldsFromHtml(html) {
  const d = {};
  String(html || '').replace(/<tr><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><\/tr>/g, (_, k, v) => { d[unesc(k)] = unesc(v); return ''; });
  return d;
}

export default async function handler(req, res) {
  const who = verify(req);
  if (!who) return res.status(401).json({ error: 'Please sign in again.' });
  try {
    if (req.method === 'GET') return res.status(200).json({ leads: await listLeads(), stages: LEAD_STAGES });
    if (req.method !== 'POST') return res.status(405).end();
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    b = b || {};

    if (b.action === 'create') {
      if (!String(b.organisation || '').trim()) return res.status(400).json({ error: 'Enter the business name.' });
      const c = await createLead(b, String(b.source || 'manual'), new Date().toISOString(), who);
      return res.status(200).json({ ok: true, id: c.id });
    }

    // Step 1 of the import: find past partner enquiry emails in the Resend log that are not leads yet
    if (b.action === 'import_scan') {
      if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Email is not configured.' });
      const have = new Set((await allCustomers()).map((c) => (c.metadata || {}).resend_id).filter(Boolean)); // includes removed leads, so they are not re-imported
      const found = [];
      let after = '', pages = 0, scanned = 0;
      while (pages < 20) {
        const j = await resend(`/emails?limit=100${after ? '&after=' + after : ''}`);
        const data = j.data || [];
        scanned += data.length;
        data.filter((e) => LEAD_SUBJECT.test(e.subject || '') && !have.has(e.id)).forEach((e) => found.push({ id: e.id, subject: e.subject, at: e.created_at }));
        pages++;
        if (!j.has_more || !data.length) break;
        after = data[data.length - 1].id;
        await sleep(550);
      }
      const oldest = scanned ? 'checked ' + scanned + ' emails' : 'no emails in the log';
      return res.status(200).json({ ok: true, found, scanned, note: oldest });
    }

    // Step 2: turn up to 5 of those emails into leads per call (Resend's rate limit keeps batches small)
    if (b.action === 'import_take') {
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => /^[\w-]{8,64}$/.test(x)).slice(0, 5);
      const made = [];
      for (const id of ids) {
        const e = await resend(`/emails/${id}`);
        const d = fieldsFromHtml(e.html);
        if (!d.organisation && /^Partner enquiry:\s*(.+)$/i.test(e.subject || '')) d.organisation = RegExp.$1;
        const c = await createLead(d, d.kind === 'partner' ? 'website (imported)' : 'contact form (imported)', when(e.created_at), who);
        await stripe('POST', `/customers/${c.id}`, { metadata: { resend_id: id } });
        made.push(c.id);
        await sleep(550);
      }
      return res.status(200).json({ ok: true, made: made.length });
    }

    const id = String(b.id || '');
    if (!/^cus_\w+$/.test(id)) return res.status(400).json({ error: 'Unknown lead.' });
    const cur = await stripe('GET', `/customers/${id}`);
    if ((cur.metadata || {}).type !== 'b2b_lead') return res.status(400).json({ error: 'Unknown lead.' });
    const metadata = { ops_updated: `${new Date().toISOString()}|${who}` };
    if (b.action === 'delete') metadata.deleted = '1';
    if (b.stage !== undefined) { if (!LEAD_STAGES.includes(b.stage)) return res.status(400).json({ error: 'Unknown stage.' }); metadata.ops_stage = b.stage; }
    if (b.note !== undefined) metadata.ops_note = String(b.note).slice(0, 480);
    if (b.owner !== undefined) metadata.ops_owner = String(b.owner).trim().slice(0, 60);
    if (b.next !== undefined) { const n = String(b.next).slice(0, 10); if (n && !/^\d{4}-\d{2}-\d{2}$/.test(n)) return res.status(400).json({ error: 'Invalid date.' }); metadata.ops_next = n; }
    for (const [k, f] of [['org', 120], ['contact', 120], ['email', 120], ['phone', 40]]) if (b[k] !== undefined) metadata[k] = String(b[k]).trim().slice(0, f);
    await stripe('POST', `/customers/${id}`, { metadata });
    return res.status(200).json({ ok: true, updated: metadata.ops_updated.split('|')[0], by: who });
  } catch (e) {
    console.error('admin leads failed:', e.message);
    return res.status(500).json({ error: 'Could not load or save leads (' + String(e.message || '').slice(0, 120) + ').' });
  }
}
