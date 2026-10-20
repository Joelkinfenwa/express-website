import { doorstep, doorstepConfigured, notConfigured, sendError } from '../../lib/doorstep.js';

export default async function handler(req, res) {
  if (!doorstepConfigured()) return notConfigured(res);
  const postcode = String(req.query.postcode || '');
  if (!/^\d{4}$/.test(postcode)) return res.status(400).json({ error: { code: 'INVALID_POSTCODE', message: 'Enter a 4-digit postcode' } });
  try {
    const { data } = await doorstep('/api/v1/coverage', { query: { postcode } });
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ postcode, supported: Boolean(data && data.supported) });
  } catch (err) { return sendError(res, err); }
}
