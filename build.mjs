// Build: copies src/ to dist/, fills {{tokens}} from site.config.json, adds
// analytics, sitemap and robots, and refuses to build if any required value is
// missing or any placeholder text would reach the live site.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { loadCatalog, CATEGORY_LABELS, CATEGORY_ORDER } from './scripts/catalog.mjs';

const ROOT = new URL('.', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'dist');
const config = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const OPTIONAL = new Set(['abn', 'supportHours', 'shopifyStoreDomain', 'shopifyStorefrontToken', 'shopifyTestsCollection', 'shopifyHomeVisitVariantId', 'gaMeasurementId', 'metaPixelId']);

// Environment variables override the file (useful in Vercel: SITE_<KEY>).
for (const k of Object.keys(config)) {
  if (k.startsWith('_')) continue;
  const env = process.env['SITE_' + k.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()];
  if (env != null && env !== '') config[k] = env;
}

const missing = Object.entries(config).filter(([k, v]) => !k.startsWith('_') && !OPTIONAL.has(k) && (v == null || String(v).trim() === '')).map(([k]) => k);
if (missing.length) {
  console.error('\nBuild stopped. Fill these values in site.config.json (or SITE_* environment variables):\n  - ' + missing.join('\n  - ') + '\n');
  process.exit(1);
}


const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function analytics() {
  let out = '';
  if (config.gaMeasurementId) {
    const id = esc(config.gaMeasurementId);
    out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}');</script>\n`;
  }
  if (config.metaPixelId) {
    const id = esc(config.metaPixelId);
    out += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');</script>\n`;
  }
  return out;
}

const problems = [];
const pages = [];

function finalize(html, rel) {
  html = html.replace('<!--analytics-->', analytics());
  // data-if="key": keep the element (minus the marker) when key has a value, drop it entirely when empty
  html = html.replace(/<(\w+)([^>]*?) data-if="(\w+)"([^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, a, key, b, inner) =>
    config[key] && String(config[key]).trim() ? `<${tag}${a}${b}>${inner}</${tag}>` : '');
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in config)) { problems.push(`${rel}: unknown token ${m}`); return m; }
    return esc(config[k]);
  });
  const leftover = html.match(/\[(?:[A-Z][A-Z0-9 ,:'’&\-—()/%.]{2,})\]/g);
  if (leftover) problems.push(`${rel}: placeholder text ${[...new Set(leftover)].join(', ')}`);
  if (/\{\{@\w+\}\}|<!--@[A-Z_]+-->/.test(html)) problems.push(`${rel}: unfilled catalogue slot`);
  return html;
}

// ---------- Catalogue (Shopify) ----------
const catalog = await loadCatalog(ROOT);
console.log(`Catalogue: ${catalog.tests.length} tests, ${catalog.addons.length} builder add-ons (source: ${catalog.source})`);
const money = (n) => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
const cartUrl = (variant) => `https://${catalog.store}/cart/${variant}:1`;
const primaryCat = (t) => t.cats[0] || 'general';
const MK = JSON.parse(readFileSync(join(ROOT, 'data/markers.json'), 'utf8'));
// Clean marker names for cards and lists (falls back to the Shopify text)
function displayNames(t) {
  const out = [], seen = new Set();
  for (const raw of t.markers) {
    const ali = MK.aliases[raw];
    if (!ali) { out.push(raw); continue; }
    for (const a of ali) {
      const key = typeof a === 'string' ? a : a.key;
      if (seen.has(key)) continue; seen.add(key);
      out.push(((typeof a === 'object' && a.name) || MK.markers[key].name).replace(/ \((?!E2)[^)]*\)$/, ''));
    }
  }
  return out;
}
function summary(t, n = 3) {
  const m = displayNames(t);
  if (!m.length) return '';
  if (m.length <= n) return m.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.';
  return m.slice(0, n).join(', ') + ` and ${m.length - n} more.`;
}
function card(t, dark = false) {
  const c = dark ? 'background: #17302A; color: #F7F4EF' : 'background: #FFFFFF; border: 1px solid #DCE0D8';
  const sub = dark ? '#C5D1CA' : '#4B5650';
  return `<a href="/tests/${t.handle}" style="display: flex; flex-direction: column; gap: 12px; padding: 30px; border-radius: 28px; ${c}; min-height: 250px; box-sizing: border-box">
<span style="font-size: 13px; font-weight: 700; color: ${dark ? '#F2A981' : '#5A645E'}">${esc(CATEGORY_LABELS[primaryCat(t)])}</span>
<span style="font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 26px; letter-spacing: -0.02em">${esc(t.title)}</span>
<span style="color: ${sub}">${esc(t.blurb || 'Includes ' + summary(t))}</span>
<span style="margin-top: auto; display: flex; justify-content: space-between; align-items: baseline"><span style="font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 30px">${money(t.price)}</span><span style="font-weight: 700">View test →</span></span>
</a>`;
}
function row(t) {
  const search = esc([t.title, ...t.markers].join(' ').toLowerCase());
  return `<a href="/tests/${t.handle}" class="cat-row" data-cats="${t.cats.join(' ')}" data-search="${search}" style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px 32px; padding: 22px 0; border-bottom: 1px solid #DCE0D8">
<span style="flex: 1 1 260px; display: flex; flex-direction: column; gap: 4px; min-width: 0"><span style="font-family: 'Instrument Sans', sans-serif; font-size: 22px; font-weight: 600; letter-spacing: -0.02em">${esc(t.title)}</span><span style="font-size: 13px; font-weight: 700; color: #5A645E">${t.kind === 'panel' ? 'Panel' : 'Single test'} · ${t.markers.length === 1 ? '1 test' : t.markers.length + ' tests'}${t.homeOnly ? ' · Home visit only' : ''}</span></span>
<span style="flex: 2 1 320px; color: #4B5650; font-size: 15px; min-width: 0">${esc(summary(t, 4))}</span>
<span style="flex: 0 0 auto; font-family: 'Instrument Sans', sans-serif; font-size: 22px; font-weight: 600">${money(t.price)}</span>
<span aria-hidden="true" style="flex: 0 0 auto; font-size: 20px">→</span>
</a>`;
}
const featured = catalog.featured.map((h) => catalog.tests.find((t) => t.handle === h)).filter(Boolean);
const usedCats = CATEGORY_ORDER.filter((c) => catalog.tests.some((t) => t.cats.includes(c)));
const catButtons = ['<button type="button" class="bt-cat" aria-pressed="true" data-cat="all">All tests</button>']
  .concat(usedCats.map((c) => `<button type="button" class="bt-cat" aria-pressed="false" data-cat="${c}">${esc(CATEGORY_LABELS[c])}</button>`)).join('\n');
const sorted = [...catalog.tests.filter((t) => t.kind === 'panel'), ...catalog.tests.filter((t) => t.kind === 'single')];
const fragments = {
  FEATURED: featured.map((t, i) => card(t, i === 0)).join('\n'),
  CATEGORY_BUTTONS: catButtons,
  ALL_TESTS: sorted.map(row).join('\n')
};
const fillFragments = (html) => html.replace(/<!--@([A-Z_]+)-->/g, (m, k) => (k in fragments ? fragments[k] : m));

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_')) continue; // templates
    const p = join(dir, name);
    const rel = relative(SRC, p);
    const dest = join(OUT, rel);
    if (statSync(p).isDirectory()) { mkdirSync(dest, { recursive: true }); walk(p); continue; }
    if (extname(name) !== '.html') { copyFileSync(p, dest); continue; }
    writeFileSync(dest, finalize(fillFragments(readFileSync(p, 'utf8')), rel));
    if (name !== '404.html') pages.push(rel === 'index.html' ? '/' : '/' + rel.replace(/\.html$/, ''));
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
walk(SRC);

// ---------- Product pages ----------
const tpl = readFileSync(join(SRC, '_product.html'), 'utf8');
mkdirSync(join(OUT, 'tests'), { recursive: true });
const siteUrl = config.siteUrl.replace(/\/$/, '');
const COPY = JSON.parse(readFileSync(join(ROOT, 'data/panel-content.json'), 'utf8'));
const GROUP_LABEL = Object.fromEntries(MK.groups);
const GROUP_ORDER = MK.groups.map((g) => g[0]);
const tick = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#17302A" stroke-width="2.4" aria-hidden="true" style="flex: none; margin-top: 3px"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
const multiCart = (ids, attrs) => `https://${catalog.store}/cart/${ids.map((i) => i + ':1').join(',')}` + (attrs ? '?' + Object.entries(attrs).map(([k, v]) => `attributes[${encodeURIComponent(k)}]=${encodeURIComponent(v)}`).join('&') : '');

// Resolve Shopify marker text to the marker library: [{ key, name, about, group }]
function resolveMarkers(t) {
  const out = [], seen = new Set();
  for (const raw of t.markers) {
    const ali = MK.aliases[raw];
    if (!ali) { out.push({ key: null, name: raw, about: null, group: 'other' }); continue; }
    for (const a of ali) {
      const key = typeof a === 'string' ? a : a.key;
      if (seen.has(key)) continue; seen.add(key);
      const m = MK.markers[key];
      out.push({ key, name: (typeof a === 'object' && a.name) || m.name, about: m.about, group: m.group });
    }
  }
  return out;
}
const resolved = new Map(catalog.tests.map((t) => [t.handle, resolveMarkers(t)]));
const keysOf = (t) => new Set(resolved.get(t.handle).map((m) => m.key).filter(Boolean));
const unmapped = new Set();

for (const t of catalog.tests) {
  const copy = COPY[t.handle] || {};
  const items = resolved.get(t.handle);
  items.filter((m) => !m.key && t.kind === 'panel').forEach((m) => unmapped.add(`${t.handle}: ${m.name}`));
  const keys = keysOf(t);
  const catLabel = CATEGORY_LABELS[primaryCat(t)];
  const single = items.length === 1 && items[0].about;
  const lead = copy.lead || t.blurb || (single ? `${items[0].about} No referral needed.` : t.kind === 'panel'
    ? `A ${items.length}-test ${catLabel.toLowerCase()} panel with no referral needed.`
    : `A private ${t.title.replace(/ test$/i, '')} test with no referral needed.`);
  const count = copy.count || String(items.length);
  const countLabel = count === '1' ? '1 test' : `${count} tests`;

  // Collection options. Home visit = the test plus the $75 home collection add-on,
  // unless Shopify already has a home variant at exactly that price.
  const hv = catalog.homeVisit;
  let home = null;
  if (t.centreVariant && t.homeVariant && hv && Math.abs(t.homePrice - t.price - hv.price) < 0.01) home = { href: cartUrl(t.homeVariant), price: t.homePrice, extra: hv.price };
  else if (t.centreVariant && hv) home = { href: multiCart([t.centreVariant, hv.id], { 'Collection method': 'Nurse home visit' }), price: t.price + hv.price, extra: hv.price };
  else if (!t.centreVariant && t.homeVariant) home = { href: cartUrl(t.homeVariant), price: t.homePrice, extra: 0 };
  const opt = (value, checked, href, price, label, sub, right) => `<label style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 18px; border-radius: 18px; border: 1px solid #D3D8D0; cursor: pointer"><span style="display: flex; gap: 12px; align-items: center"><input type="radio" name="pp-mode" value="${value}"${checked ? ' checked' : ''} data-href="${href}" data-price="${money(price)}" style="width: 20px; height: 20px; accent-color: #17302A"><span style="display: flex; flex-direction: column"><span style="font-weight: 700">${label}</span><span style="font-size: 14px; color: #4B5650">${sub}</span></span></span><span style="font-weight: 700">${right}</span></label>`;
  const centreOption = t.centreVariant ? opt('centre', true, cartUrl(t.centreVariant), t.price, 'Walk-in centre', '2,000+ partner centres', 'Included')
    : '<p style="margin: 0; font-size: 14px; color: #4B5650">This test is currently available with a home visit only.</p>';
  const homeOption = home ? opt('home', !t.centreVariant, home.href, home.price, 'Nurse at home', 'Home or workplace visit', home.extra ? '+' + money(home.extra) : 'Included')
    : '<p style="margin: 0; font-size: 14px; color: #4B5650">Need a home visit for this test? <a href="/book" style="text-decoration: underline">Request a nurse</a>.</p>';
  const startPrice = t.centreVariant ? t.price : home ? home.price : t.price;
  const startHref = t.centreVariant ? cartUrl(t.centreVariant) : home ? home.href : cartUrl(t.homeVariant);

  // Preparation
  const morningHormones = ['testosterone', 'cortisol'].filter((k) => keys.has(k)).map((k) => MK.markers[k].name.toLowerCase());
  const prep = [];
  if (keys.has('insulin')) prep.push(['Fast for 8 to 12 hours', 'This test includes fasting insulin. Have nothing but water beforehand, and keep taking prescribed medication unless your doctor advises otherwise.']);
  if (morningHormones.length) prep.push(['Book a morning collection', `${morningHormones.join(' and ').replace(/^./, (c) => c.toUpperCase())} ${morningHormones.length > 1 ? 'are' : 'is'} highest in the morning, so a morning collection gives the most comparable result.`]);
  if (keys.has('ctng')) prep.push(['Includes a urine sample', 'Your urine sample is collected at the same appointment as your blood test.']);
  prep.push(['Drink water as normal', 'Being well hydrated makes collection easier. Wear a top with sleeves that roll up easily.']);
  const prepLabel = keys.has('insulin') ? 'Fasting required' : morningHormones.length ? 'Morning collection' : null;
  const prepHtml = `<section style="max-width: 1320px; margin: 0 auto; padding: 88px 24px 0; display: flex; flex-wrap: wrap; gap: 48px">
<div style="flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 14px"><span style="font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #A4502E">Before your collection</span><h2 style="margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(30px, 3.6vw, 44px); line-height: 1.04; letter-spacing: -0.035em">How to prepare.</h2><p style="margin: 0; color: #4B5650">If your doctor has given you different instructions, follow those. Our <a href="/prepare" style="text-decoration: underline">preparation guide</a> has more detail.</p></div>
<ol style="flex: 2 1 560px; min-width: 0; margin: 0; padding: 0; list-style: none; border-top: 1px solid #1C2420">
${prep.map(([h, p], i) => `<li style="display: flex; gap: 20px; padding: 20px 0; border-bottom: 1px solid #DCE0D8"><span style="font-family: 'Instrument Sans', sans-serif; font-weight: 600; color: #A4502E; min-width: 28px">0${i + 1}</span><span style="display: flex; flex-direction: column; gap: 4px"><span style="font-weight: 700; font-size: 18px">${h}</span><span style="color: #4B5650">${p}</span></span></li>`).join('\n')}
</ol>
</section>`;

  // Facts row
  const fact = (k, v, first) => `<div style="padding: 18px${first ? ' 18px 18px 0' : ''}; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 13px; color: #5A645E; font-weight: 600">${k}</span><span style="font-weight: 700; font-size: 18px">${v}</span></div>`;
  const facts = [fact('Included', countLabel, true), fact('Referral', 'Not needed'), fact('Collection', t.centreVariant && home ? 'Centre or home' : t.centreVariant ? 'Partner centre' : 'Home visit'), fact(prepLabel ? 'Preparation' : 'Results', prepLabel || 'Doctor-reviewed')].join('\n');

  // Suited to + group summary
  const suited = (copy.whoFor || []).length ? `<div style="display: flex; flex-direction: column; gap: 12px; max-width: 640px"><span style="font-weight: 700">Suited to</span><ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px">${copy.whoFor.map((w) => `<li style="display: flex; gap: 10px; color: #4B5650">${tick}${esc(w)}</li>`).join('')}</ul></div>` : '';
  const groups = [];
  for (const g of [...GROUP_ORDER, 'other']) { const ms = items.filter((m) => m.group === g); if (ms.length) groups.push([g, ms]); }
  const glance = t.kind === 'panel' && groups.length > 1 ? `<div style="display: flex; flex-wrap: wrap; gap: 8px">${groups.map(([g, ms]) => `<span style="padding: 8px 14px; border-radius: 999px; border: 1px solid #D3D8D0; font-size: 14px; font-weight: 600">${esc(GROUP_LABEL[g] || 'Other')} <span style="color: #A4502E">${ms.length}</span></span>`).join('')}</div>` : '';

  // What is tested, grouped
  const markersHtml = groups.map(([g, ms]) => `<div class="pp-group" style="background: #FFFFFF; border-radius: 24px; padding: 26px 28px; display: flex; flex-direction: column; gap: 4px">
<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding-bottom: 10px"><h3 style="margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 22px; letter-spacing: -0.02em">${esc(g === 'other' ? (groups.length === 1 ? t.title : 'Also included') : GROUP_LABEL[g])}</h3><span style="font-size: 14px; color: #5A645E; font-weight: 600">${ms.length === 1 ? '1 test' : ms.length + ' tests'}</span></div>
<ul style="margin: 0; padding: 0; list-style: none">${ms.map((m) => `<li style="display: flex; gap: 10px; padding: 12px 0; border-top: 1px solid #E3E6E0">${tick}<span style="display: flex; flex-direction: column; gap: 2px"><span style="font-weight: 700">${esc(m.name)}</span>${m.about ? `<span style="font-size: 15px; color: #4B5650">${esc(m.about)}</span>` : ''}</span></li>`).join('')}</ul>
</div>`).join('\n');

  // Upgrade suggestion: cheapest panel that contains everything in this one
  let upgrade = '';
  if (t.kind === 'panel' && keys.size) {
    const up = catalog.tests.filter((x) => x.kind === 'panel' && x.handle !== t.handle && x.price > t.price && [...keys].every((k) => keysOf(x).has(k)) && keysOf(x).size > keys.size).sort((a, b) => a.price - b.price)[0];
    if (up) {
      const extra = resolved.get(up.handle).filter((m) => m.key && !keys.has(m.key));
      const names = extra.slice(0, 3).map((m) => m.name.replace(/ \(.*\)$/, '')).join(', ');
      upgrade = `<a href="/tests/${up.handle}" style="display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; border-radius: 18px; background: #FBEDE4; color: #1C2420"><span style="font-size: 13px; font-weight: 700; color: #A4502E">Want the fuller picture?</span><span style="font-weight: 700">${esc(up.title)} adds ${extra.length} more test${extra.length === 1 ? '' : 's'} for +${money(Math.round((up.price - t.price) * 100) / 100)}</span><span style="font-size: 14px; color: #4B5650">Including ${esc(names)}${extra.length > 3 ? ' and more' : ''}.</span></a>`;
    }
  }

  // FAQ
  const faq = [
    ['Do I need a referral?', 'No. We issue the pathology request form with your order, so there is no GP visit needed.'],
    home && home.extra ? ['Can a nurse come to me?', `Yes. Choose "Nurse at home" and a home visit is added for ${money(home.extra)}. A registered nurse collects at your home or workplace. You can check your postcode on our <a href="${config.bookingUrl}" style="text-decoration: underline">booking page</a>.`] : null,
    ['How should I prepare?', prep.slice(0, -1).length ? prep.slice(0, -1).map(([h, p]) => `${h}. ${p}`).join(' ') + ' Drink water as normal beforehand.' : 'Drink water as normal and wear a top with sleeves that roll up easily. If your doctor has given you instructions, follow those.'],
    ['Is this covered by Medicare?', 'This is a private test ordered without a GP referral, so Medicare rebates do not apply.'],
    ['Can I share my results with my GP?', 'Yes. Your report is yours to forward to any doctor.']
  ].filter(Boolean);
  const faqHtml = faq.map(([q, a]) => `<details style="border-bottom: 1px solid #DCE0D8; padding: 20px 0"><summary style="display: flex; justify-content: space-between; align-items: center; gap: 16px; font-weight: 700; font-size: 19px; min-height: 44px">${q}<span class="faq-plus" aria-hidden="true" style="font-size: 28px; font-weight: 400; color: #A4502E; transition: transform 0.2s">+</span></summary><p style="margin: 12px 0 0; color: #4B5650">${a}</p></details>`).join('\n');
  const strip = (h) => h.replace(/<[^>]+>/g, '');

  const related = catalog.tests.filter((x) => x.handle !== t.handle && x.cats.includes(primaryCat(t))).sort((a, b) => (b.kind === t.kind) - (a.kind === t.kind) || Math.abs(a.price - t.price) - Math.abs(b.price - t.price)).slice(0, 3);
  const url = `${siteUrl}/tests/${t.handle}`;
  const jsonld = JSON.stringify([
    { '@context': 'https://schema.org', '@type': 'Product', name: t.title, description: lead, url, image: `${siteUrl}/assets/img/og.jpg`,
      brand: { '@type': 'Brand', name: 'Express Pathology' },
      offers: { '@type': 'Offer', priceCurrency: 'AUD', price: startPrice.toFixed(2), availability: 'https://schema.org/InStock', url } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl + '/' },
      { '@type': 'ListItem', position: 2, name: 'Blood tests', item: siteUrl + '/tests' },
      { '@type': 'ListItem', position: 3, name: t.title, item: url }] },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: strip(a) } })) }
  ]).replace(/</g, '\\u003c');

  const vals = {
    title: esc(t.title), handle: t.handle, kindLabel: t.kind === 'panel' ? 'Panel' : 'Single test', categoryLabel: esc(catLabel), lead: esc(lead),
    metaDescription: esc(`${t.title}: ${lead} ${money(startPrice)}, no referral needed, collected at a partner centre or at home.`.slice(0, 300)),
    priceLabel: money(startPrice), buyUrl: startHref,
    includedHeading: copy.includedHeading || (count === '1' ? 'What this test measures.' : `${count} tests in one collection.`), jsonld
  };
  const slots = { FACTS: facts, SUITED: suited, GLANCE: glance, CENTRE_OPTION: centreOption, HOME_OPTION: homeOption, UPGRADE: upgrade, MARKERS: markersHtml, PREP: prepHtml, FAQ: faqHtml, RELATED: related.map((x) => card(x)).join('\n') };
  const html = tpl.replace(/\{\{@(\w+)\}\}/g, (m, k) => (k in vals ? vals[k] : m)).replace(/<!--@([A-Z_]+)-->/g, (m, k) => (k in slots ? slots[k] : m));
  const rel = `tests/${t.handle}.html`;
  writeFileSync(join(OUT, rel), finalize(html, rel));
  pages.push(`/tests/${t.handle}`);
}
if (unmapped.size) console.warn('Note: panel markers without a plain-English description (add to data/markers.json):\n  ' + [...unmapped].join('\n  '));

// Coverage for the request form
const cov = JSON.parse(readFileSync(join(ROOT, 'data/coverage.json'), 'utf8'));
writeFileSync(join(OUT, 'assets/coverage.json'), JSON.stringify({ metro: cov.metro || [], regional: cov.regional || [], metroFee: config.metroFee, regionalFee: config.regionalFee }));
if (!(cov.metro || []).length) console.warn('Note: data/coverage.json has no postcodes yet; the request form will not show coverage.');

// Builder data for the browser
writeFileSync(join(OUT, 'assets/catalog.json'), JSON.stringify({ store: catalog.store, addons: catalog.addons, homeVisit: catalog.homeVisit, base: catalog.base }));

if (problems.length) {
  console.error('\nBuild stopped. These would have gone live:\n  - ' + problems.join('\n  - ') + '\n');
  process.exit(1);
}

const site = config.siteUrl.replace(/\/$/, '');
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.sort().map((p) => `  <url><loc>${site}${p === '/' ? '/' : p}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${site}/sitemap.xml\n`);
console.log(`Built ${pages.length} pages into dist/`);
