import { doorstep, doorstepConfigured, notConfigured, sendError } from '../../lib/doorstep.js';

// Creates (or updates) the patient, books the slot, and attaches the referral if one was uploaded.
// Patient details pass straight through to Doorstep and are never logged or stored here.

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'];
const MAX_DOC_BYTES = 3.5 * 1024 * 1024; // keeps the whole request under Vercel's 4.5 MB body limit
const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export function toE164Mobile(input) {
  const digits = String(input || '').replace(/[^\d+]/g, '');
  let n = digits;
  if (/^04\d{8}$/.test(n)) n = '+61' + n.slice(1);
  else if (/^614\d{8}$/.test(n)) n = '+' + n;
  else if (/^\+614\d{8}$/.test(n)) n = n;
  else return null;
  return n;
}

function bad(res, field, message) {
  return res.status(400).json({ error: { code: 'VALIDATION', field, message } });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: { code: 'METHOD', message: 'Method not allowed' } }); }
  if (!doorstepConfigured()) return notConfigured(res);
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  if (b.company_website) return res.status(200).json({ ok: true, ignored: true }); // honeypot

  const s = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
  const firstName = s(b.firstName, 80), lastName = s(b.lastName, 80), email = s(b.email, 200).toLowerCase();
  const mobile = toE164Mobile(b.mobile);
  const dateOfBirth = s(b.dateOfBirth, 10);
  const line1 = s(b.line1), suburb = s(b.suburb, 80), state = s(b.state, 3).toUpperCase(), postcode = s(b.postcode, 4);
  const startsAt = s(b.startsAt, 40);
  const idempotencyKey = s(b.idempotencyKey, 200);

  if (!firstName) return bad(res, 'firstName', 'Enter your first name');
  if (!lastName) return bad(res, 'lastName', 'Enter your last name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'email', 'Enter a valid email address');
  if (!mobile) return bad(res, 'mobile', 'Enter an Australian mobile number, for example 0412 345 678');
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return bad(res, 'dateOfBirth', 'Enter a valid date of birth');
  if (!line1) return bad(res, 'line1', 'Enter the street address for the visit');
  if (!suburb) return bad(res, 'suburb', 'Enter the suburb');
  if (!STATES.includes(state)) return bad(res, 'state', 'Choose a state');
  if (!/^\d{4}$/.test(postcode)) return bad(res, 'postcode', 'Enter a 4-digit postcode');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(startsAt)) return bad(res, 'startsAt', 'Choose an appointment time');
  if (!idempotencyKey) return bad(res, 'idempotencyKey', 'Missing booking key');

  let doc = null;
  if (b.referral && b.referral.content) {
    const contentType = s(b.referral.contentType, 60);
    if (!DOC_TYPES.includes(contentType)) return bad(res, 'referral', 'Upload the request form as a PDF, JPG or PNG');
    const bytes = Math.floor(String(b.referral.content).length * 3 / 4);
    if (bytes > MAX_DOC_BYTES) return bad(res, 'referral', 'The file is too large. Please upload a file under 3.5 MB');
    doc = { fileName: s(b.referral.fileName, 120) || 'referral', contentType, content: String(b.referral.content) };
  }

  const noteParts = [s(b.notes, 1000)];
  if (b.hasReferral === 'no') noteParts.push('Patient has no referral (ordered a test or needs one).');
  noteParts.push('Booked via expresspathology.com.au');

  try {
    const patient = await doorstep('/api/v1/patients', {
      method: 'POST',
      body: { firstName, lastName, email, mobile, ...(dateOfBirth ? { dateOfBirth } : {}) }
    });
    const patientId = patient.data && patient.data.id;
    if (!patientId) return res.status(502).json({ error: { code: 'UPSTREAM_ERROR', message: 'The booking system did not return a patient record' } });

    const appt = await doorstep('/api/v1/appointments', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        patientId,
        startsAt,
        address: { line1, suburb, state, postcode },
        notes: noteParts.filter(Boolean).join(' '),
        ...(b.fastingRequired === true ? { fastingRequired: true } : {}),
        ...(s(b.preferredNurseGender, 20) ? { preferredNurseGender: s(b.preferredNurseGender, 20) } : {})
      }
    });
    const booking = appt.data || {};
    if (!booking.id) return res.status(502).json({ error: { code: 'UPSTREAM_ERROR', message: 'The booking was not confirmed' } });

    let referralAttached = null;
    if (doc) {
      try {
        await doorstep(`/api/v1/appointments/${encodeURIComponent(booking.id)}/documents`, { method: 'POST', body: doc });
        referralAttached = true;
      } catch { referralAttached = false; } // booking stands; the team follows up for the form
    }

    return res.status(201).json({
      id: booking.id,
      reference: booking.episodeRef || null,
      status: booking.status,
      startsAt: booking.startsAt || startsAt,
      durationMins: booking.durationMins || null,
      referralAttached
    });
  } catch (err) { return sendError(res, err); }
}
