import { doorstepConfigured, doorstepEnvironment } from '../../lib/doorstep.js';

// Tells the booking page whether to show live booking or the request form.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ live: doorstepConfigured(), environment: doorstepConfigured() ? doorstepEnvironment() : null });
}
