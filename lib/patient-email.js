// Patient confirmation emails sent after payment: one for collection centre orders, one for
// mobile nurse (home visit) orders, including home visits with the patient's own request form.
// Table-based, inline-styled HTML for email clients, with a plain-text version.
const SITE = 'https://expresspathology.com.au';
const PHONE = '02 9545 2940', TEL = 'tel:+61295452940';
const C = { forest: '#17302A', ink: '#1C2420', body: '#4B5650', muted: '#6B746E', line: '#DCE0D8', ivory: '#F7F4EF', sage: '#E8EDE6', peach: '#F2A981', clay: '#A4502E', white: '#FFFFFF' };
const FONT = "'Instrument Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BODY = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// Partner laboratory by state (as on /collection-centres)
const LABS = {
  '4cyte': { name: '4Cyte Pathology', url: 'https://www.4cyte.com.au/Locations' },
  acl: { name: 'Australian Clinical Labs', url: 'https://www.clinicallabs.com.au/location' }
};
const labFor = (state) => (['SA', 'WA', 'TAS', 'NT'].includes(String(state || '').toUpperCase()) ? LABS.acl : LABS['4cyte']);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n).toFixed(2).replace(/\.00$/, '');
const longDate = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
};

// Order lines with prices, recomputed from the price index and the session metadata
export function orderLines(s, PRICES) {
  const m = s.metadata || {}, out = [];
  let tests = [];
  if (m.order_type === 'panel' && PRICES.panels[m.panel]) {
    const p = PRICES.panels[m.panel]; out.push({ name: p.title, sub: `${p.lines.length} tests`, price: p.price }); tests = p.lines;
  } else if (m.order_type === 'builder') {
    const chosen = [m.tests, m.tests_2, m.tests_3].filter(Boolean).join(',').split(',').map((x) => PRICES.addons[x]).filter(Boolean);
    if (PRICES.builderFee) out.push({ name: 'Build your own test', sub: 'Combined collection and report', price: PRICES.builderFee });
    chosen.forEach((a) => out.push({ name: a.title, price: a.price })); tests = chosen.flatMap((a) => a.lines);
  } else if (m.order_type === 'own-form') {
    const area = /regional/i.test(m.collection) ? 'regional' : 'metro';
    out.push({ name: 'Home visit with your doctor\'s request form', sub: area === 'metro' ? 'Metro' : 'Regional', price: PRICES.ownForm[area] });
  }
  if (m.order_type !== 'own-form' && /^Home/.test(m.collection) && PRICES.homeVisit != null) out.push({ name: 'Home visit', sub: 'Registered nurse at your door', price: PRICES.homeVisit });
  return { lines: out, tests };
}

// Preparation advice, matching the product pages
function prep(tests, { home, ownForm }) {
  const t = tests.join(' ').toLowerCase(), out = [];
  if (ownForm) out.push(['Follow your doctor\'s instructions', 'Your doctor\'s request form may ask you to fast or to be collected at a set time. If you are unsure, check with your doctor before the visit.']);
  if (/insulin|homa/.test(t)) out.push(['Fast for 8 to 12 hours', 'Your tests include fasting insulin. Have nothing but water beforehand, and keep taking prescribed medication unless your doctor advises otherwise.']);
  const morning = ['testosterone', 'cortisol'].filter((k) => t.includes(k));
  if (morning.length) out.push([home ? 'A morning visit is best' : 'Go in the morning', `${morning.join(' and ').replace(/^./, (c) => c.toUpperCase())} ${morning.length > 1 ? 'are' : 'is'} highest in the morning, so a morning collection gives the most comparable result.`]);
  if (/chlamydia|urine/.test(t)) out.push(['Includes a urine sample', 'Try not to pass urine for an hour before your collection.']);
  out.push(['Drink water as normal', 'Being well hydrated makes collection easier. Wear a top with sleeves that roll up easily.']);
  return out;
}

// ---------- Building blocks ----------
const p = (html, o = {}) => `<p style="margin:${o.m || '0'};font-family:${BODY};font-size:${o.size || 16}px;line-height:${o.lh || 1.6};color:${o.color || C.body}">${html}</p>`;
const button = (href, label, o = {}) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${o.full ? ' width="100%"' : ''}><tr><td align="center" bgcolor="${o.bg || C.forest}" style="border-radius:999px;${o.border ? `border:1px solid ${C.forest};` : ''}"><a href="${href}" target="_blank" style="display:inline-block;padding:15px 28px;font-family:${BODY};font-size:15px;font-weight:700;line-height:1;color:${o.fg || C.white};text-decoration:none;border-radius:999px">${label}</a></td></tr></table>`;
const eyebrow = (s, color = C.clay) => `<div style="font-family:${BODY};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${color}">${s}</div>`;
const h2 = (s) => `<h2 style="margin:8px 0 0;font-family:${FONT};font-size:26px;line-height:1.15;font-weight:600;letter-spacing:-0.02em;color:${C.ink}">${s}</h2>`;
const section = (inner, o = {}) => `<tr><td class="px" style="padding:${o.pad || '36px 40px'};${o.bg ? `background:${o.bg};` : ''}${o.top ? `border-top:1px solid ${C.line};` : ''}">${inner}</td></tr>`;

function steps(list) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px">${list.map(([h, body], i) => `<tr><td valign="top" width="52" style="padding:${i ? '22px' : '0'} 0 0"><div style="width:36px;height:36px;border-radius:999px;background:${C.forest};color:${C.ivory};font-family:${FONT};font-size:15px;font-weight:600;line-height:36px;text-align:center">${i + 1}</div></td><td valign="top" style="padding:${i ? '22px' : '0'} 0 0"><div style="font-family:${FONT};font-size:19px;font-weight:600;letter-spacing:-0.01em;color:${C.ink};line-height:1.3;padding-top:6px">${h}</div><div style="margin-top:6px">${body}</div></td></tr>`).join('')}</table>`;
}
function checklist(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-top:1px solid ${C.line}">${items.map(([h, body]) => `<tr><td valign="top" width="34" style="padding:18px 0;border-bottom:1px solid ${C.line}"><div style="width:22px;height:22px;border-radius:999px;background:${C.sage};color:${C.forest};font-family:${BODY};font-size:13px;font-weight:700;line-height:22px;text-align:center">&#10003;</div></td><td valign="top" style="padding:18px 0;border-bottom:1px solid ${C.line}"><div style="font-family:${BODY};font-size:16px;font-weight:700;color:${C.ink};line-height:1.4">${h}</div>${p(body, { size: 15, m: '4px 0 0' })}</td></tr>`).join('')}</table>`;
}
function summary(lines, total, reference) {
  return `${eyebrow('Order summary', C.muted)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-top:1px solid ${C.ink}">
${lines.map((l) => `<tr><td style="padding:14px 0;border-bottom:1px solid ${C.line};font-family:${BODY};font-size:15px;color:${C.ink};line-height:1.4"><strong>${esc(l.name)}</strong>${l.sub ? `<br><span style="color:${C.muted};font-size:13px">${esc(l.sub)}</span>` : ''}</td><td align="right" valign="top" style="padding:14px 0 14px 12px;border-bottom:1px solid ${C.line};font-family:${BODY};font-size:15px;color:${C.ink};white-space:nowrap">${money(l.price)}</td></tr>`).join('')}
<tr><td style="padding:16px 0 0;font-family:${FONT};font-size:18px;font-weight:600;color:${C.ink}">Total paid</td><td align="right" style="padding:16px 0 0;font-family:${FONT};font-size:18px;font-weight:600;color:${C.ink}">${money(total)}</td></tr>
<tr><td colspan="2" style="padding:6px 0 0;font-family:${BODY};font-size:13px;color:${C.muted}">Order ${esc(reference)} &middot; Paid by card in AUD</td></tr>
</table>`;
}
const help = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.sage};border-radius:20px"><tr><td class="px-in" style="padding:26px 28px">
<div style="font-family:${FONT};font-size:20px;font-weight:600;color:${C.ink};letter-spacing:-0.01em">Need to change something?</div>
${p('Reply to this email or call our team. We are happy to help with times, addresses or your tests.', { size: 15, m: '6px 0 16px' })}
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td>${button(TEL, 'Call ' + PHONE)}</td></tr></table>
</td></tr></table>`;

function layout({ preheader, image, imageAlt, body }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>Express Pathology</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500;600&display=swap" rel="stylesheet">
<style>
body{margin:0;padding:0;background:${C.ivory}}
a{color:${C.forest}}
@media (max-width:620px){
 .px{padding-left:24px!important;padding-right:24px!important}
 .px-in{padding:22px!important}
 .h1{font-size:34px!important}
 .stack{display:block!important;width:100%!important}
 .stack-gap{padding:0 0 14px!important}
 .kv-k{display:block!important;width:100%!important;padding:14px 0 2px!important;border-bottom:0!important}
 .kv-v{display:block!important;width:100%!important;padding:0 0 14px!important}
}
</style></head>
<body style="margin:0;padding:0;background:${C.ivory}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${'&#8203;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.ivory}"><tr><td align="center" style="padding:28px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td style="padding:4px 8px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><a href="${SITE}" style="text-decoration:none;font-family:${FONT};font-size:24px;letter-spacing:-0.04em;color:${C.ink}"><b style="font-weight:600">express</b><span style="color:${C.peach};font-weight:700">.</span><span style="font-weight:500"> pathology</span></a></td>
<td align="right" style="font-family:${BODY};font-size:13px"><a href="${TEL}" style="color:${C.body};text-decoration:none">${PHONE}</a></td>
</tr></table></td></tr>
<tr><td style="background:${C.white};border-radius:28px;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${image ? `<tr><td style="padding:0;line-height:0;font-size:0"><img src="${SITE}/assets/img/email/${image}" width="600" alt="${esc(imageAlt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:28px 28px 0 0"></td></tr>` : ''}
${body}
</table></td></tr>
<tr><td style="padding:28px 16px 0;text-align:center">
<div style="font-family:${FONT};font-size:18px;letter-spacing:-0.03em;color:${C.ink}"><b style="font-weight:600">express</b><span style="color:${C.peach}">.</span> pathology</div>
${p(`Private blood tests and mobile collection across Australia.<br><a href="${SITE}/tests" style="color:${C.body}">Tests</a> &nbsp;&middot;&nbsp; <a href="${SITE}/prepare" style="color:${C.body}">Preparing</a> &nbsp;&middot;&nbsp; <a href="${SITE}/contact" style="color:${C.body}">Contact</a>`, { size: 13, m: '8px 0 0', color: C.muted })}
${p('Results are reviewed by an Australian doctor and are not a diagnosis. Always speak with your doctor about your health. You are receiving this email because you placed an order with Express Pathology.', { size: 12, m: '14px auto 0', color: C.muted, lh: 1.5 })}
</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------- The two emails ----------
function hero(eb, title, intro) {
  return section(`${eyebrow(eb)}<h1 class="h1" style="margin:12px 0 0;font-family:${FONT};font-size:40px;line-height:1.05;font-weight:600;letter-spacing:-0.035em;color:${C.ink}">${title}</h1>${p(intro, { size: 17, m: '16px 0 0' })}`, { pad: '36px 40px 8px' });
}

function centreEmail(m, ctx) {
  const lab = labFor(m.state), first = esc(m.first_name || 'there');
  const formStep = ctx.attached
    ? p('Your pathology request form is attached to this email as a PDF. Print it and bring it with you, along with photo ID.', { size: 15 })
    : p('Our team will email your pathology request form to you separately. Print it and bring it with you, along with photo ID.', { size: 15 });
  const centreStep = `${p(`Your form is accepted at partner collection centres${m.state ? ` across ${esc(String(m.state).toUpperCase())}` : ''}. We recommend <strong style="color:${C.ink}">${lab.name}</strong>.`, { size: 15 })}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr><td class="stack stack-gap" style="padding-right:10px">${button(lab.url, `Find a ${lab.name.split(' ')[0]} centre`)}</td><td class="stack">${button(SITE + '/collection-centres', 'All partner centres', { bg: C.white, fg: C.forest, border: true })}</td></tr></table>`;
  const prepList = ctx.prep.map(([h, b]) => `<strong style="color:${C.ink}">${h}.</strong> ${b}`).join('<br><br>');
  const body = [
    hero(`Order confirmed &middot; ${esc(m.reference)}`, `You're all set, ${first}.`, ctx.attached ? 'Thank you for your order. Your request form is attached, so you can visit a partner collection centre whenever suits you. Here is everything you need.' : 'Thank you for your order. Here is everything you need for your collection at a partner centre.'),
    section(`${eyebrow('Your next steps')}${h2('Three steps to your results.')}${steps([
      [ctx.attached ? 'Print your request form' : 'Watch for your request form', formStep],
      ['Prepare for your collection', p(prepList, { size: 15 })],
      ['Visit a partner collection centre', centreStep]
    ])}`, { pad: '30px 40px 36px' }),
    section(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:4px solid ${C.peach};background:${C.ivory};border-radius:0 16px 16px 0"><tr><td style="padding:18px 20px">
<div style="font-family:${BODY};font-size:15px;font-weight:700;color:${C.ink}">Your test is already paid for</div>
${p('Only use the laboratories listed on your request form. Another laboratory may bill you again for the same test. If anyone asks for payment, call us on ' + PHONE + '.', { size: 14, m: '4px 0 0' })}
</td></tr></table>`, { pad: '0 40px 36px' }),
    section(`${eyebrow('After your collection')}${h2('What happens next.')}${p('The laboratory processes your sample and your results are reviewed by an Australian doctor. We will let you know when they are ready.', { size: 15, m: '12px 0 0' })}`, { top: true }),
    section(summary(ctx.lines, ctx.total, m.reference), { top: true }),
    section(help, { pad: '0 40px 40px' })
  ].join('\n');
  return {
    subject: ctx.attached ? `Here is your pathology request form (Order ${m.reference})` : `Your Express Pathology order is confirmed (Order ${m.reference})`,
    html: layout({ preheader: ctx.attached ? 'Your pathology request form is attached. Print it and visit a partner collection centre.' : 'Your order is confirmed. Here is how to prepare and where to go.', image: 'centre.jpg', imageAlt: 'A woman checking her order on her phone at home', body }),
    text: [`You're all set, ${m.first_name || 'there'}.`, `Order ${m.reference} is confirmed.`, '',
      '1. ' + (ctx.attached ? 'Print your request form (attached) and bring it with photo ID.' : 'We will email your request form separately. Print it and bring it with photo ID.'),
      '2. Prepare: ' + ctx.prep.map(([h, b]) => `${h}. ${b}`).join(' '),
      `3. Visit a partner collection centre. We recommend ${lab.name}: ${lab.url}. All centres: ${SITE}/collection-centres`, '',
      'Your test is already paid for. Only use the laboratories listed on your form, as another laboratory may bill you again.', '',
      ...ctx.lines.map((l) => `${l.name}  ${money(l.price)}`), `Total paid  ${money(ctx.total)}`, '',
      `Questions? Reply to this email or call ${PHONE}.`].join('\n')
  };
}

function nurseEmail(m, ctx) {
  const first = esc(m.first_name || 'there');
  const when = [longDate(m.preferred_date), m.preferred_time].filter(Boolean).join(', ');
  const address = [m.address, [m.suburb, String(m.state || '').toUpperCase(), m.postcode].filter(Boolean).join(' ')].filter(Boolean);
  const row = (k, v, last) => `<tr><td class="kv-k" valign="top" width="120" style="padding:14px 0;${last ? '' : `border-bottom:1px solid ${C.line};`}font-family:${BODY};font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted}">${k}</td><td class="kv-v" valign="top" style="padding:14px 0;${last ? '' : `border-bottom:1px solid ${C.line};`}font-family:${BODY};font-size:16px;color:${C.ink};line-height:1.45">${v}</td></tr>`;
  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.ivory};border-radius:20px"><tr><td class="px-in" style="padding:24px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>${eyebrow('Your home visit', C.forest)}</td><td align="right"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${C.white};border:1px solid ${C.line};font-family:${BODY};font-size:12px;font-weight:700;white-space:nowrap;color:${C.clay}">&#9679;&nbsp; Time to be confirmed</span></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">
${row('Requested', esc(when || 'No preference given'))}
${row('Address', address.map(esc).join('<br>') || 'As given at checkout')}
${row('Collection', ctx.ownForm ? 'Your doctor\'s request form' : esc(ctx.lines[0] ? ctx.lines[0].name : 'Blood collection'), true)}
</table></td></tr></table>`;
  const before = [
    ...(ctx.ownForm ? [['Have your doctor\'s request form ready', 'Your nurse needs the original form, or the copy you uploaded, at the visit.']] : []),
    ['Have photo ID ready', 'Your nurse will confirm your name and date of birth before collecting.'],
    ...ctx.prep,
    ['Somewhere to sit', 'A chair at a table with good light is ideal. Please secure any pets before your nurse arrives.']
  ];
  const formLine = ctx.ownForm ? '' : ctx.attached
    ? p('Your request form is attached for your records. Your nurse brings the form to your visit, so there is nothing to print.', { size: 15, m: '14px 0 0' })
    : p('Your nurse brings your request form to the visit, so there is nothing to print.', { size: 15, m: '14px 0 0' });
  const body = [
    hero(`Order confirmed &middot; ${esc(m.reference)}`, `Your nurse is coming to you, ${first}.`, 'Thank you for your order. A registered nurse will come to your home or workplace for your collection. Our team will contact you to confirm the exact time.'),
    section(card + formLine, { pad: '26px 40px 36px' }),
    section(`${eyebrow('Before your visit')}${h2('How to prepare.')}${checklist(before)}`, { top: true }),
    section(`${eyebrow('On the day')}${h2('What to expect.')}${steps([
      ['Your nurse arrives', p('Your nurse checks your ID and your request form, then answers any questions you have.', { size: 15 })],
      ['A quick collection', p('It only takes a few minutes. Your nurse labels your samples in front of you.', { size: 15 })],
      ['Off to the lab', p('Your samples go to an accredited partner laboratory, and your results are reviewed by a doctor. We will let you know when they are ready.', { size: 15 })]
    ])}`, { top: true }),
    section(summary(ctx.lines, ctx.total, m.reference), { top: true }),
    section(help, { pad: '0 40px 40px' })
  ].join('\n');
  return {
    subject: `Your home visit is booked (Order ${m.reference})`,
    html: layout({ preheader: 'A registered nurse is coming to you. Our team will confirm your appointment time.', image: 'nurse.jpg', imageAlt: 'A registered nurse arriving at a patient\'s home', body }),
    text: [`Your nurse is coming to you, ${m.first_name || 'there'}.`, `Order ${m.reference} is confirmed. Our team will contact you to confirm the exact time.`, '',
      `Requested: ${when || 'No preference given'}`, `Address: ${address.join(', ')}`, '',
      'Before your visit:', ...before.map(([h, b]) => `- ${h}. ${b}`), '',
      ...ctx.lines.map((l) => `${l.name}  ${money(l.price)}`), `Total paid  ${money(ctx.total)}`, '',
      `Questions? Reply to this email or call ${PHONE}.`].join('\n')
  };
}

// s = paid Stripe Checkout Session; attached = the request form PDF is attached to this email
export function patientEmail(s, PRICES, { attached = false } = {}) {
  const m = s.metadata || {};
  const { lines, tests } = orderLines(s, PRICES);
  const home = m.order_type === 'own-form' || /^Home/.test(m.collection || '');
  const ownForm = m.order_type === 'own-form';
  const ctx = { lines, total: (s.amount_total || 0) / 100, attached, ownForm, prep: prep(tests, { home, ownForm }) };
  return home ? nurseEmail(m, ctx) : centreEmail(m, ctx);
}

// Clinic-ordered collection (for example Optimal Health Clinic): ordered through the clinic and
// billed to the clinic monthly, so this confirmation deliberately carries no pricing anywhere.
// o = { reference, clinic, firstName, state, preferredDate, preferredTime, address, suburb,
//       postcode, tests: [names], home: boolean, attached: boolean }
export function clinicOrderEmail(o) {
  const first = esc(o.firstName || 'there');
  const clinic = esc(o.clinic);
  const lab = labFor(o.state);
  const prepList = prep(o.tests, { home: o.home, ownForm: false });
  const testsBlock = `${eyebrow('Your tests', C.muted)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-top:1px solid ${C.ink}">
${o.tests.map((t, i) => `<tr><td style="padding:12px 0;${i === o.tests.length - 1 ? '' : `border-bottom:1px solid ${C.line};`}font-family:${BODY};font-size:15px;color:${C.ink};line-height:1.4">${esc(t)}</td></tr>`).join('')}
</table>
<div style="margin-top:10px;font-family:${BODY};font-size:13px;color:${C.muted}">Order ${esc(o.reference)} &middot; Requested through ${clinic} &middot; No payment is due from you</div>`;

  if (o.home) {
    const when = [longDate(o.preferredDate), o.preferredTime].filter(Boolean).join(', ');
    const address = [o.address, [o.suburb, String(o.state || '').toUpperCase(), o.postcode].filter(Boolean).join(' ')].filter(Boolean);
    const row = (k, v, last) => `<tr><td class="kv-k" valign="top" width="120" style="padding:14px 0;${last ? '' : `border-bottom:1px solid ${C.line};`}font-family:${BODY};font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted}">${k}</td><td class="kv-v" valign="top" style="padding:14px 0;${last ? '' : `border-bottom:1px solid ${C.line};`}font-family:${BODY};font-size:16px;color:${C.ink};line-height:1.45">${v}</td></tr>`;
    const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.ivory};border-radius:20px"><tr><td class="px-in" style="padding:24px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>${eyebrow('Your home visit', C.forest)}</td><td align="right"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${C.white};border:1px solid ${C.line};font-family:${BODY};font-size:12px;font-weight:700;white-space:nowrap;color:${C.clay}">&#9679;&nbsp; Time to be confirmed</span></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">
${row('Requested', esc(when || 'No preference given'))}
${row('Address', address.map(esc).join('<br>'), true)}
</table></td></tr></table>`;
    const formLine = o.attached
      ? p('Your request form is attached for your records. Your nurse brings the form to your visit, so there is nothing to print.', { size: 15, m: '14px 0 0' })
      : p('Your nurse brings your request form to the visit, so there is nothing to print.', { size: 15, m: '14px 0 0' });
    const before = [
      ['Have photo ID ready', 'Your nurse will confirm your name and date of birth before collecting.'],
      ...prepList,
      ['Somewhere to sit', 'A chair at a table with good light is ideal. Please secure any pets before your nurse arrives.']
    ];
    const body = [
      hero(`Order confirmed &middot; ${esc(o.reference)}`, `Your nurse is coming to you, ${first}.`, `${clinic} has arranged your blood collection with us. A registered nurse will come to your home or workplace — our team will contact you within 4 hours to confirm the exact time.`),
      section(card + formLine, { pad: '26px 40px 36px' }),
      section(`${eyebrow('Before your visit')}${h2('How to prepare.')}${checklist(before)}`, { top: true }),
      section(`${eyebrow('On the day')}${h2('What to expect.')}${steps([
        ['Your nurse arrives', p('Your nurse checks your ID and your request form, then answers any questions you have.', { size: 15 })],
        ['A quick collection', p('It only takes a few minutes. Your nurse labels your samples in front of you.', { size: 15 })],
        ['Your results go to your clinic', p(`Your samples go to an accredited partner laboratory. Results are reviewed and sent to ${clinic}, who will follow up with you.`, { size: 15 })]
      ])}`, { top: true }),
      section(testsBlock, { top: true }),
      section(help, { pad: '0 40px 40px' })
    ].join('\n');
    return {
      subject: `Your home visit is arranged (Order ${o.reference})`,
      html: layout({ preheader: 'A registered nurse is coming to you. Our team will confirm your visit time.', image: 'nurse.jpg', imageAlt: 'A registered nurse arriving at a patient\'s home', body }),
      text: [`Your nurse is coming to you, ${o.firstName || 'there'}.`, `${o.clinic} has arranged your blood collection with us. Order ${o.reference} is confirmed — our team will contact you within 4 hours to confirm the exact time.`, '',
        `Requested: ${when || 'No preference given'}`, `Address: ${address.join(', ')}`, '',
        'Before your visit:', ...before.map(([h, b]) => `- ${h}. ${b}`), '',
        'Your tests:', ...o.tests.map((t) => `- ${t}`), '',
        `Your results are reviewed and sent to ${o.clinic}, who will follow up with you. No payment is due from you.`,
        `Questions? Reply to this email or call ${PHONE}.`].join('\n')
    };
  }

  const formStep = o.attached
    ? p('Your pathology request form is attached to this email as a PDF. Print it and bring it with you, along with photo ID.', { size: 15 })
    : p('We will email your pathology request form separately. Print it and bring it with you, along with photo ID.', { size: 15 });
  const body = [
    hero(`Order confirmed &middot; ${esc(o.reference)}`, `You're all set, ${first}.`, `${clinic} has arranged your blood test with us. Your request form is attached, so you can visit a partner collection centre whenever suits you.`),
    section(`${eyebrow('Three simple steps')}${h2('How your collection works.')}${steps([
      [o.attached ? 'Print your request form' : 'Watch for your request form', formStep],
      ['Visit a partner centre', p(`Walk into any ${esc(lab.name)} collection centre whenever suits you — no appointment needed.`, { size: 15 }) + `<div style="margin-top:14px">${button(lab.url, 'Find your nearest centre')}</div>`],
      ['Your results go to your clinic', p(`Results are reviewed and sent to ${clinic}, who will follow up with you.`, { size: 15 })]
    ])}`, { pad: '26px 40px 36px' }),
    section(`${eyebrow('Before you go')}${h2('How to prepare.')}${checklist(prepList)}`, { top: true }),
    section(testsBlock, { top: true }),
    section(help, { pad: '0 40px 40px' })
  ].join('\n');
  return {
    subject: `Your pathology request form (Order ${o.reference})`,
    html: layout({ preheader: 'Your pathology request form is attached. Print it and visit a partner collection centre.', image: 'centre.jpg', imageAlt: 'A woman checking her order on her phone at home', body }),
    text: [`You're all set, ${o.firstName || 'there'}.`, `${o.clinic} has arranged your blood test with us (order ${o.reference}).`, '',
      `1. Print your request form (attached) and bring it with photo ID.`,
      `2. Walk into any ${lab.name} collection centre — no appointment needed. Locations: ${lab.url}`,
      `3. Results are reviewed and sent to ${o.clinic}, who will follow up with you. No payment is due from you.`, '',
      'Your tests:', ...o.tests.map((t) => `- ${t}`), '',
      `Questions? Reply to this email or call ${PHONE}.`].join('\n')
  };
}

// Home-collection upsell sent after a clinic-ordered collection-centre order. The $75 home visit
// upgrade is the one price a clinic-order patient does see, because it is theirs to pay.
export function homeUpgradeEmail(o) {
  const first = esc(o.firstName || 'there');
  const url = `${SITE}/optimal-home?ref=${encodeURIComponent(o.reference)}${o.postcode ? '&postcode=' + encodeURIComponent(o.postcode) : ''}`;
  const body = [
    hero('Prefer not to travel?', `We can come to you, ${first}.`, `Your request form is on its way for collection at a partner centre — but if it is easier, a registered nurse can collect your bloods at your home or workplace instead, for a flat $75.`),
    section(`${eyebrow('How it works')}${h2('Three quick steps.')}${steps([
      ['Tell us where and when', p('Enter your postcode, pick a preferred date and morning or afternoon — it takes under a minute.', { size: 15 })],
      ['Pay the $75 visit fee', p('Secure card payment online. Your tests are already covered — the $75 is the only cost to you.', { size: 15 })],
      ['Your nurse comes to you', p('Our team confirms the exact time within 4 hours. Your nurse brings everything, including your request form.', { size: 15 })]
    ])}<div style="margin-top:26px">${button(url, 'Book my home collection — $75', { full: true })}</div>`, { pad: '26px 40px 36px' }),
    section(p(`Happy to visit a centre instead? Nothing to do — just bring your attached request form and photo ID whenever suits you. Your order reference is ${esc(o.reference)}.`, { size: 14, color: C.muted }), { top: true, pad: '24px 40px' }),
    section(help, { pad: '0 40px 40px' })
  ].join('\n');
  return {
    subject: 'Prefer us to come to you? Add a home collection for $75',
    html: layout({ preheader: 'A registered nurse can collect at your home or workplace for a flat $75.', image: 'nurse.jpg', imageAlt: 'A registered nurse arriving at a patient\'s home', body }),
    text: [`We can come to you, ${o.firstName || 'there'}.`, '',
      'Your request form is on its way for collection at a partner centre — but if it is easier, a registered nurse can collect your bloods at home or work instead, for a flat $75.', '',
      '1. Tell us where and when — postcode, preferred date, morning or afternoon.',
      '2. Pay the $75 visit fee online. Your tests are already covered.',
      '3. Our team confirms the exact time within 4 hours and your nurse comes to you.', '',
      `Book here: ${url}`, '',
      `Happy to visit a centre instead? Nothing to do — bring your request form and photo ID. Order ${o.reference}.`,
      `Questions? Call ${PHONE}.`].join('\n')
  };
}

// Confirmation after the $75 home visit upgrade is paid
export function homeUpgradePaidEmail(o) {
  const first = esc(o.firstName || 'there');
  const when = [longDate(o.preferredDate), o.preferredTime].filter(Boolean).join(', ');
  const address = [o.address, [o.suburb, String(o.state || '').toUpperCase(), o.postcode].filter(Boolean).join(' ')].filter(Boolean);
  const row = (k, v, last) => `<tr><td class="kv-k" valign="top" width="120" style="padding:14px 0;${last ? '' : `border-bottom:1px solid ${C.line};`}font-family:${BODY};font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted}">${k}</td><td class="kv-v" valign="top" style="padding:14px 0;${last ? '' : `border-bottom:1px solid ${C.line};`}font-family:${BODY};font-size:16px;color:${C.ink};line-height:1.45">${v}</td></tr>`;
  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.ivory};border-radius:20px"><tr><td class="px-in" style="padding:24px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>${eyebrow('Your home visit', C.forest)}</td><td align="right"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${C.white};border:1px solid ${C.line};font-family:${BODY};font-size:12px;font-weight:700;white-space:nowrap;color:${C.clay}">&#9679;&nbsp; Time to be confirmed</span></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">
${row('Requested', esc(when || 'No preference given'))}
${row('Address', address.map(esc).join('<br>'), true)}
</table></td></tr></table>`;
  const body = [
    hero(`Home visit added &middot; ${esc(o.reference)}`, `Your nurse is coming to you, ${first}.`, 'Thank you — your home collection is paid and locked in. Our team will contact you within 4 hours to confirm the exact time. There is nothing to print: your nurse brings your request form.'),
    section(card, { pad: '26px 40px 36px' }),
    section(help, { pad: '0 40px 40px' })
  ].join('\n');
  return {
    subject: `Your home visit is arranged (Order ${o.reference})`,
    html: layout({ preheader: 'Your home collection is paid. Our team will confirm the exact time within 4 hours.', image: 'nurse.jpg', imageAlt: 'A registered nurse arriving at a patient\'s home', body }),
    text: [`Your nurse is coming to you, ${o.firstName || 'there'}.`, `Your home collection for order ${o.reference} is paid and locked in. Our team will contact you within 4 hours to confirm the exact time. Nothing to print — your nurse brings your request form.`, '',
      `Requested: ${when || 'No preference given'}`, `Address: ${address.join(', ')}`, '',
      `Questions? Reply to this email or call ${PHONE}.`].join('\n')
  };
}
