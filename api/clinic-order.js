// Receives live orders from the Optimal Health Clinic ordering page (expresspathology.com.au/optimal).
// No payment is taken at the point of order: every order is billed to the clinic on one consolidated
// monthly invoice. On each order this endpoint generates the pathology request form PDF (same
// generator as paid website orders) with the panel's tests listed, emails the full order with the
// form to the operations inbox, and sends the patient a confirmation with the form attached.
// The patient email carries NO pricing — billing sits between Express and the clinic.
import { requestFormPdf } from '../lib/request-form.js';
import { clinicOrderEmail } from '../lib/patient-email.js';

const CLINIC = 'Optimal Health Clinic';
const PANELS = {
  male: { n: 'Male Initial', p: 176, lines: ['Testosterone — Total, Free + SHBG', 'E2 (Oestradiol)', 'Full Blood Count', 'Cortisol', 'CRP (high sensitivity)', 'DHEAS', 'FSH / LH', 'Progesterone', 'Prolactin', 'MBA20 biochemistry', 'IGF-1', 'PSA', 'Growth Hormone'] },
  female: { n: 'Female Initial', p: 194, lines: ['Testosterone — Total, Free + SHBG', 'E2 (Oestradiol)', 'Full Blood Count', 'Cortisol', 'CRP (high sensitivity)', 'DHEAS', 'FSH / LH', 'Progesterone', 'Prolactin', 'MBA20 biochemistry', 'Ferritin', 'TSH'] },
  followup: { n: 'OHC Follow Up', p: 131, lines: ['Testosterone — Total, Free + SHBG', 'E2 (Oestradiol)', 'Full Blood Count', 'E/LFT (kidney + liver)', 'IGF-1', 'PSA'] }
};
const ADDONS = {
  copper: { n: 'Copper', p: 55 },
  zinc: { n: 'Zinc', p: 55 },
  b12: { n: 'Vitamin B12', p: 65 },
  iron: { n: 'Iron Studies', p: 45 },
  thyroid: { n: 'Thyroid — TSH, FT3, FT4', p: 65 },
  iodine: { n: 'Urine iodine / creatinine (spot)', p: 79 }
};
const HOME_FEE = 75;
const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'];
const PHONE = '02 9545 2940', TEL = 'tel:+61295452940', SITE = 'https://expresspathology.com.au';
const LABS = {
  '4cyte': { name: '4Cyte Pathology', url: 'https://www.4cyte.com.au/Locations' },
  acl: { name: 'Australian Clinical Labs', url: 'https://www.clinicallabs.com.au/location' }
};
const labFor = (state) => (['SA', 'WA', 'TAS', 'NT'].includes(String(state || '').toUpperCase()) ? LABS.acl : LABS['4cyte']);

const str = (v, max = 160) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function send(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
}

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
    address: str(body.address, 160), suburb: str(body.suburb, 80), state: str(body.state, 3).toUpperCase(), postcode: str(body.postcode, 4)
  };
  if (!p.firstName || !p.lastName) return res.status(400).json({ error: 'Please enter the patient name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return res.status(400).json({ error: 'Please enter a valid patient email address.' });
  if (p.phone.replace(/\D/g, '').length < 8) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  if (!/^\d{4}$/.test(p.postcode)) return res.status(400).json({ error: 'Please enter a 4-digit postcode.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dob)) return res.status(400).json({ error: 'Please enter the patient date of birth.' });
  if (!['Male', 'Female'].includes(p.sex)) return res.status(400).json({ error: 'Please select sex.' });
  if (!p.address) return res.status(400).json({ error: 'Please enter the street address.' });
  if (!p.suburb) return res.status(400).json({ error: 'Please enter the suburb.' });
  if (!STATES.includes(p.state)) return res.status(400).json({ error: 'Please select the state.' });

  const reference = /^OHC-[A-Z0-9]{4,8}$/.test(str(body.reference, 14)) ? str(body.reference, 14) : 'OHC-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const total = panel.p + addons.reduce((a, t) => a + t.p, 0) + (home ? HOME_FEE : 0);
  const lab = labFor(p.state);
  const iodine = addons.some((a) => a === ADDONS.iodine);

  // Pathology request form, same generator as paid website orders, with every test listed
  let form = null, formError = '';
  try {
    const items = [{ title: panel.n, lines: panel.lines }];
    if (addons.length) items.push({ title: 'Additional markers', lines: addons.map((a) => a.n) });
    const bytes = await requestFormPdf({
      reference, patient: p, items, fasting: false,
      billingLine: 'Commercial account order — do not bill the patient. Bill Express Pathology using the codes in the bottom-left of this form.',
      billingBanner: 'DO NOT BILL THE PATIENT \u00b7 COMMERCIAL ACCOUNT ORDER \u00b7 BILL EXPRESS PATHOLOGY USING THE CODES ABOVE',
      notes: [`${CLINIC} order — invoice monthly, no payment due from the patient.`, iodine ? 'Includes urine iodine / creatinine — urine specimen required (container in the collection kit).' : ''].filter(Boolean).join(' ')
    });
    form = { filename: `Pathology request form ${reference}.pdf`, content: Buffer.from(bytes).toString('base64') };
  } catch (e) { formError = e.message; console.error('request form failed:', e.message); }

  const d = {
    reference,
    clinic: CLINIC,
    billing: 'Invoice monthly — no payment taken at order',
    panel: `${panel.n} — $${panel.p} incl. GST`,
    add_ons: addons.length ? addons.map((a) => `${a.n} — $${a.p}`).join('; ') : 'None',
    collection: home ? `Home visit (+$${HOME_FEE}) — contact the patient within 4 hours to confirm the time` : `Collection centre (${lab.name})`,
    preferred: home ? [str(body.preferredDate, 10), str(body.preferredTime, 20)].filter(Boolean).join(', ') : '',
    order_total: `$${total.toFixed(2)} incl. GST`,
    patient: `${p.firstName} ${p.lastName}`,
    dob: p.dob, sex: p.sex, patient_email: p.email, patient_phone: p.phone,
    address: [p.address, p.suburb, p.state, p.postcode].join(', '),
    page: '/optimal'
  };
  const rows = Object.entries(d).filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#66706A">${esc(k)}</td><td style="padding:4px 0">${esc(String(v))}</td></tr>`).join('');
  const team = {
    from: process.env.ENQUIRY_FROM,
    to: process.env.ENQUIRY_TO.split(',').map((s) => s.trim()),
    subject: `OHC ORDER ${reference} (invoice monthly): ${d.patient} — ${panel.n}${addons.length ? ` +${addons.length} add-on${addons.length > 1 ? 's' : ''}` : ''} — ${home ? 'Home visit ' + p.postcode : 'Collection centre'}`,
    html: `<table>${rows}</table>` + (form
      ? `<p>The pathology request form is attached and has been emailed to the patient${home ? ' (home visit: the nurse brings the form)' : ' with collection instructions'}. The patient email contains no pricing.</p>`
      : `<p style="color:#B3261E"><strong>Request form generation failed (${esc(formError)}) — generate and send it manually.</strong></p>`),
    ...(form ? { attachments: [form] } : {})
  };

  try {
    await send(team);
  } catch (e) {
    return res.status(502).json({ error: 'The order could not be transmitted. Please call us on 02 9545 2940 and we will take it over the phone.' });
  }
  // The patient email must never block the order; the team copy is the system of record
  try {
    const pe = clinicOrderEmail({
      reference, clinic: CLINIC, firstName: p.firstName, state: p.state,
      preferredDate: str(body.preferredDate, 10), preferredTime: str(body.preferredTime, 20),
      address: p.address, suburb: p.suburb, postcode: p.postcode,
      tests: [...panel.lines, ...addons.map((a) => a.n)], home, attached: !!form
    });
    await send({
      from: process.env.ENQUIRY_FROM, to: [p.email],
      reply_to: (process.env.ENQUIRY_TO || '').split(',')[0] || undefined,
      subject: pe.subject, html: pe.html, text: pe.text,
      ...(form ? { attachments: [form] } : {})
    });
  } catch (e) { console.error('patient email failed:', e.message); }
  return res.status(200).json({ ok: true, reference });
}
