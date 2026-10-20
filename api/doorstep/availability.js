import { doorstep, doorstepConfigured, notConfigured, sendError } from '../../lib/doorstep.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  if (!doorstepConfigured()) return notConfigured(res);
  const { postcode, from, to } = req.query;
  if (!/^\d{4}$/.test(String(postcode || ''))) return res.status(400).json({ error: { code: 'INVALID_POSTCODE', message: 'Enter a 4-digit postcode' } });
  if (!DATE.test(String(from || '')) || !DATE.test(String(to || ''))) return res.status(400).json({ error: { code: 'INVALID_DATES', message: 'from and to must be YYYY-MM-DD' } });
  try {
    const { data } = await doorstep('/api/v1/availability', { query: { postcode, from, to } });
    res.setHeader('Cache-Control', 'no-store'); // slots change as bookings land
    return res.status(200).json({ slots: (data && data.slots) || [] });
  } catch (err) { return sendError(res, err); }
}
