// Receives live orders from the Optimal Health Clinic ordering page (expresspathology.com.au/optimal).
// No payment is taken at the point of order: every order is billed to the clinic on one consolidated
// monthly invoice. Delivery: email to the operations inbox via Resend (RESEND_API_KEY + ENQUIRY_TO +
// ENQUIRY_FROM), the same transport as api/enquiry.js. Prices live here, server-side — the browser's
// figures are display only.

const PANELS = {
  male: { n: 'Male Initial', p: 176 },
  female: { n: 'Female Initial', p: 194 },
  followup: { n: 'OHC Follow Up', p: 131 }
};
const ADDONS = {
  copper: { n: 'Copper', p: 55 },
  zinc: { n: 'Zinc', p: 55 },
  b12: { n: 'Vitamin B12', p: 65 },
  iron: { n: 'Iron Studies', p: 45 },
  thyroid: { n: 'Thyroid — TSH, FT3, FT4', p: 65 },
  iodine: { n: 'Urine iodine / creatinine (spot)', p: null } // price to be confirmed; flagged in the order email
};
const HOME_FEE = 75;

const str = (v, max = 160) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const panel = PANELS[str(body.panel, 12)];
  if (!panel) return res.status(400).json({ error: 'Please select a panel.' });
  const addons = [...new Set((Array.isArray(body.addons) ? body.addons : []).map((s) => str(s, 12)))].map((k) => ADDONS[k]).filter(Boolean);
  const home = str(body.collection, 10) === 'home';

  const p = {
    firstName: str(body.firstName, 60), lastName: str(body.lastName, 60), email: str(body.email, 160).toLowerCase(),
    phone: str(body.phone, 30), dob: str(body.dob, 10), sex: str(body.sex, 10),
    address: str(body.address, 160), postcode: str(body.postcode, 4)
  };
  if (!p.firstName || !p.lastName) return res.status(400).json({ error: 'Please enter the patient name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return res.status(400).json({ error: 'Please enter a valid patient email address.' });
  if (p.phone.replace(/\D/g, '').length < 8) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  if (!/^\d{4}$/.test(p.postcode)) return res.status(400).json({ error: 'Please enter a 4-digit postcode.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dob)) return res.status(400).json({ error: 'Please enter the patient date of birth.' });
  if (!['Male', 'Female'].includes(p.sex)) return res.status(400).json({ error: 'Please select sex.' });
  if (!p.address) return res.status(400).json({ error: 'Please enter the street address.' });

  const reference = /^OHC-[A-Z0-9]{4,8}$/.test(str(body.reference, 14)) ? str(body.reference, 14) : 'OHC-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const priced = addons.filter((a) => a.p != null);
  const tbc = addons.filter((a) => a.p == null);
  const total = panel.p + priced.reduce((a, t) => a + t.p, 0) + (home ? HOME_FEE : 0);

  const d = {
    reference,
    clinic: 'Optimal Health Clinic',
    billing: 'Invoice monthly — no payment taken at order',
    panel: `${panel.n} — $${panel.p} incl. GST`,
    add_ons: addons.length ? addons.map((a) => (a.p == null ? `${a.n} — PRICE TBC` : `${a.n} — $${a.p}`)).join('; ') : 'None',
    collection: home ? `Home visit (+$${HOME_FEE}) — contact the patient within 4 hours to confirm the time` : 'Collection centre',
    preferred: home ? [str(body.preferredDate, 10), str(body.preferredTime, 20)].filter(Boolean).join(', ') : '',
    order_total: `$${total.toFixed(2)} incl. GST${tbc.length ? ' + urine iodine (price TBC)' : ''}`,
    patient: `${p.firstName} ${p.lastName}`,
    dob: p.dob, sex: p.sex, patient_email: p.email, patient_phone: p.phone,
    address: p.address, postcode: p.postcode,
    page: '/optimal'
  };
  const rows = Object.entries(d).filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#66706A">${esc(k)}</td><td style="padding:4px 0">${esc(String(v))}</td></tr>`).join('');
  const subject = `OHC ORDER ${reference} (invoice monthly): ${d.patient} — ${panel.n}${addons.length ? ` +${addons.length} add-on${addons.length > 1 ? 's' : ''}` : ''} — ${home ? 'Home visit ' + p.postcode : 'Collection centre'}`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: process.env.ENQUIRY_FROM,
        to: process.env.ENQUIRY_TO.split(',').map((s) => s.trim()),
        subject,
        html: `<table>${rows}</table><p>Placed on the Optimal Health Clinic ordering page. Issue the pathology request form and send it to the patient with instructions.</p>`
      })
    });
    if (!r.ok) throw new Error(`Resend ${r.status}`);
  } catch (e) {
    return res.status(502).json({ error: 'The order could not be transmitted. Please call us on 02 9545 2940 and we will take it over the phone.' });
  }
  return res.status(200).json({ ok: true, reference });
}
