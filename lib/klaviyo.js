// Minimal Klaviyo helpers (no SDK). Used by the quiz funnel so the follow-up emails can run as a
// Klaviyo flow. Everything here is optional: without KLAVIYO_PRIVATE_KEY these calls do nothing.
//
// Events sent:
//   "Completed Test Finder"   when someone finishes the quiz at /quiz (trigger for the follow-up flow)
//   "Placed Website Order"    when a website order is paid (use as the flow's exit filter)
const API = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

export const klaviyoReady = () => !!process.env.KLAVIYO_PRIVATE_KEY;

async function post(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`, revision: REVISION, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Klaviyo ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
}

// Record an event against a profile (created if new). `value` is the order total for purchases.
export async function klaviyoEvent(name, { email, firstName, lastName }, properties = {}, value) {
  if (!klaviyoReady() || !email) return;
  await post('/events/', { data: { type: 'event', attributes: {
    properties,
    ...(value != null ? { value, value_currency: 'AUD' } : {}),
    metric: { data: { type: 'metric', attributes: { name } } },
    profile: { data: { type: 'profile', attributes: { email, ...(firstName ? { first_name: firstName } : {}), ...(lastName ? { last_name: lastName } : {}) } } }
  } } });
}

// Subscribe a profile to email marketing on the list in KLAVIYO_LIST_ID. Only call this where the
// person was told on the form that they would receive marketing emails.
export async function klaviyoSubscribe(email, source) {
  if (!klaviyoReady() || !process.env.KLAVIYO_LIST_ID || !email) return;
  await post('/profile-subscription-bulk-create-jobs/', { data: { type: 'profile-subscription-bulk-create-job', attributes: {
    custom_source: source,
    profiles: { data: [{ type: 'profile', attributes: { email, subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } } } }] }
  }, relationships: { list: { data: { type: 'list', id: process.env.KLAVIYO_LIST_ID } } } } });
}
