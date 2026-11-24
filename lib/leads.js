// B2B leads (clinics and other businesses that enquire about partnering), shown in the orders tracker's
// "B2B leads" section. Each lead is a Stripe customer with metadata.type = 'b2b_lead', the same store the
// tracker already uses for partner referrals and jobs. Website partner enquiries create one automatically.
import { stripe } from './stripe.js';
import { allCustomers } from './order-number.js';

export const LEAD_STAGES = ['new', 'contacted', 'meeting', 'proposal', 'onboarding', 'won', 'lost'];
const cut = (v, n = 480) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

// d uses the website form field names: name, email, phone, organisation, organisation_type, monthly_volume, interest, message, page
export async function createLead(d, source = 'website', received = new Date().toISOString(), who = '') {
  const org = cut(d.organisation || d.company || d.name, 120);
  const metadata = {
    type: 'b2b_lead', org, contact: cut(d.name, 120), email: cut(d.email, 120), phone: cut(d.phone, 40),
    org_type: cut(d.organisation_type, 80), volume: cut(d.monthly_volume, 60), interest: cut(d.interest, 200),
    message: cut(d.message, 480), page: cut(d.page, 200), source: cut(source, 40), received: cut(received, 30),
    ops_stage: 'new', ops_updated: `${new Date().toISOString()}|${who || 'website'}`
  };
  return stripe('POST', '/customers', { description: `B2B lead: ${org}`, email: metadata.email || undefined, name: metadata.contact || undefined, metadata });
}

export function fromCustomer(c) {
  const m = c.metadata || {};
  const [updated, by] = String(m.ops_updated || '').split('|');
  return {
    id: c.id, org: m.org || '', contact: m.contact || '', email: m.email || '', phone: m.phone || '', orgType: m.org_type || '', volume: m.volume || '',
    interest: m.interest || '', message: m.message || '', page: m.page || '', source: m.source || '', received: m.received || new Date(c.created * 1000).toISOString(),
    stage: LEAD_STAGES.includes(m.ops_stage) ? m.ops_stage : 'new', note: m.ops_note || '', next: m.ops_next || '', owner: m.ops_owner || '', resendId: m.resend_id || '', updated: updated || '', by: by || ''
  };
}

export async function listLeads(all) {
  const list = all || await allCustomers();
  return list.filter((c) => (c.metadata || {}).type === 'b2b_lead' && (c.metadata || {}).deleted !== '1').map(fromCustomer).sort((a, b) => String(b.received).localeCompare(String(a.received)));
}
