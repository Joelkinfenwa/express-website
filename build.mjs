// Build: copies src/ to dist/, fills {{tokens}} from site.config.json, adds
// analytics, sitemap and robots, and refuses to build if any required value is
// missing or any placeholder text would reach the live site.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
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

// Version asset URLs so browsers pick up new CSS/JS straight after a deploy
const ASSET_VER = Date.now().toString(36);
function finalize(html, rel) { return finalizeBase(html, rel).replace(/(["'])(\/assets\/[\w./-]+\.(?:js|css))\1/g, `$1$2?v=${ASSET_VER}$1`); }
function finalizeBase(html, rel) {
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
<span style="font-size: 13px; font-weight: 700; color: ${dark ? '#F2A981' : '#5A645E'}">${t.handle === catalog.flagship ? 'Our flagship · ' : ''}${esc(CATEGORY_LABELS[primaryCat(t)])}</span>
<span style="font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 26px; letter-spacing: -0.02em">${esc(t.title)}</span>
<span style="color: ${sub}">${esc(t.blurb || 'Includes ' + summary(t))}</span>
<span style="margin-top: auto; display: flex; justify-content: space-between; align-items: baseline"><span style="font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 30px">${money(t.price)}</span><span style="font-weight: 700">View test →</span></span>
</a>`;
}
function row(t) {
  const search = esc([t.title, ...t.markers, ...displayNames(t)].join(' ').toLowerCase());
  return card(t).replace('<a href=', `<a class="cat-row" data-cats="${t.cats.join(' ')}" data-search="${search}" href=`);
}
const featured = catalog.featured.map((h) => catalog.tests.find((t) => t.handle === h)).filter(Boolean);
const usedCats = CATEGORY_ORDER.filter((c) => catalog.tests.some((t) => t.cats.includes(c)));
const catButtons = ['<button type="button" class="bt-cat" aria-pressed="true" data-cat="all">All panels</button>']
  .concat(usedCats.map((c) => `<button type="button" class="bt-cat" aria-pressed="false" data-cat="${c}">${esc(CATEGORY_LABELS[c])}</button>`)).join('\n');
const sorted = [...catalog.tests.filter((t) => t.handle === catalog.flagship), ...catalog.tests.filter((t) => t.handle !== catalog.flagship)];
// Home page: flagship feature plus three featured panels
function homeTests() {
  const flag = catalog.tests.find((t) => t.handle === catalog.flagship);
  const copy = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'data/panel-content.json'), 'utf8')); } catch { return {}; } })();
  const others = featured.filter((t) => t !== flag).slice(0, 3);
  const grid = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px">${others.map((t) => card(t)).join('\n')}</div>`;
  if (!flag) return grid;
  const groups = {};
  for (const raw of flag.markers) for (const a of MK.aliases[raw] || []) { const k = typeof a === 'string' ? a : a.key; const g = MK.markers[k].group; (groups[g] = groups[g] || new Set()).add(k); }
  const GL = Object.fromEntries(MK.groups);
  const chips = MK.groups.filter(([g]) => groups[g]).map(([g]) => `<span style="padding: 8px 14px; border-radius: 999px; border: 1px solid #3A5A50; font-size: 14px; font-weight: 600">${esc(GL[g])} <span style="color: #F2A981">${groups[g].size}</span></span>`).join('');
  const n = displayNames(flag).length;
  return `<div style="background: #17302A; color: #F7F4EF; border-radius: 32px; padding: clamp(28px, 4vw, 48px); display: flex; flex-wrap: wrap; gap: 32px 48px; align-items: flex-end">
<div style="flex: 3 1 480px; min-width: 0; display: flex; flex-direction: column; gap: 18px">
<span style="font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #F2A981">Our flagship panel</span>
<span style="font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(34px, 4.6vw, 60px); line-height: 1; letter-spacing: -0.04em">${esc(flag.title)}</span>
<p style="margin: 0; color: #C5D1CA; font-size: 18px; max-width: 620px">${esc((copy[flag.handle] || {}).lead || 'Includes ' + summary(flag))}</p>
<div style="display: flex; flex-wrap: wrap; gap: 8px">${chips}</div>
</div>
<div style="flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: 14px">
<span style="color: #C5D1CA">${n} tests in one collection</span>
<span style="font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 48px; letter-spacing: -0.03em; line-height: 1">${money(flag.price)}</span>
<a href="/tests/${flag.handle}" class="btn" style="background: #F2A981; color: #1C2420; justify-content: center">View the panel</a>
</div>
</div>
${grid}`;
}
// Hero photos (data/hero-images.json). Returns '' when the photo does not exist yet.
const HERO = JSON.parse(readFileSync(join(ROOT, 'data/hero-images.json'), 'utf8'));
function heroPhoto(name, alt, style, { fallback = false, eager = true } = {}) {
  let dir = 'heroes';
  if (!name || !existsSync(join(SRC, 'assets/img/heroes', name + '.webp'))) {
    if (!fallback) return '';
    [name, alt] = HERO.fallback; dir = '';
  }
  const base = '/assets/img/' + (dir ? dir + '/' : '') + name;
  return `<img src="${base}-1200.webp" srcset="${base}-1200.webp ${dir ? 800 : 1200}w, ${base}.webp ${dir ? 1600 : 2400}w" sizes="(max-width: 900px) 100vw, 50vw" alt="${esc(alt)}" width="1200" height="675"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} style="display: block; width: 100%; height: 100%; object-fit: cover; ${style || ''}">`;
}
const fragments = {
  FEATURED: featured.map((t, i) => card(t, i === 0)).join('\n'),
  CATEGORY_BUTTONS: catButtons,
  ALL_TESTS: sorted.map(row).join('\n'),
  HOME_TESTS: homeTests(),
  BUILDER_FEE: catalog.base ? `A ${money(catalog.base.price)} build-your-own fee applies to each order.` : '',
  QUIZ_DATA: JSON.stringify({
    tests: Object.fromEntries(catalog.tests.map((t) => [t.handle, { title: t.title, price: t.price, url: `/tests/${t.handle}`, count: String(displayNames(t).length), includes: summary(t, 4), homeOnly: !t.centreVariant }])),
    addons: Object.fromEntries(catalog.addons.map((a) => [a.title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), { title: a.title.trim(), price: a.price }])),
    base: catalog.base ? catalog.base.price : 0
  }).replace(/</g, '\\u003c')
};
// Topic links for the tests page
{
  const TP = JSON.parse(readFileSync(join(ROOT, 'data/topics.json'), 'utf8')).topics;
  const nm = (tp) => tp.label;
  fragments.TOPIC_LINKS = TP.map((tp) => `<a href="/blood-tests/${tp.slug}" style="padding: 10px 16px; border-radius: 999px; border: 1px solid #D3D8D0; background: #FFFFFF; font-weight: 600; font-size: 15px">${esc(nm(tp).replace(/^./, (c) => c.toUpperCase()))}</a>`).join('\n');
}
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
    if (!['404.html', 'checkout.html', 'order-confirmed.html', 'partner-referral.html'].includes(name)) pages.push(rel === 'index.html' ? '/' : '/' + rel.replace(/\.html$/, ''));
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
  // Checkout runs on Stripe via /checkout; home visit = the panel plus the home visit fee
  const coHref = (h) => `/checkout?panel=${encodeURIComponent(t.handle)}${h ? '&home=1' : ''}`;
  if (t.centreVariant && hv) home = { href: coHref(true), price: t.price + hv.price, extra: hv.price };
  const opt = (value, checked, href, price, label, sub, right) => `<label style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 18px; border-radius: 18px; border: 1px solid #D3D8D0; cursor: pointer"><span style="display: flex; gap: 12px; align-items: center"><input type="radio" name="pp-mode" value="${value}"${checked ? ' checked' : ''} data-href="${href}" data-price="${money(price)}" style="width: 20px; height: 20px; accent-color: #17302A"><span style="display: flex; flex-direction: column"><span style="font-weight: 700">${label}</span><span style="font-size: 14px; color: #4B5650">${sub}</span></span></span><span style="font-weight: 700">${right}</span></label>`;
  const centreOption = t.centreVariant ? opt('centre', true, coHref(false), t.price, 'Walk-in centre', '2,000+ partner centres', 'Included')
    : '<p style="margin: 0; font-size: 14px; color: #4B5650">This test is currently available with a home visit only.</p>';
  const homeOption = home ? opt('home', !t.centreVariant, home.href, home.price, 'Nurse at home', 'Home or workplace visit', home.extra ? '+' + money(home.extra) : 'Included')
    : '<p style="margin: 0; font-size: 14px; color: #4B5650">Need a home visit for this test? <a href="/book" style="text-decoration: underline">Request a nurse</a>.</p>';
  const startPrice = t.centreVariant ? t.price : home ? home.price : t.price;
  const startHref = t.centreVariant ? coHref(false) : home ? home.href : '/contact';

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
    title: esc(t.title), handle: t.handle, kindLabel: t.handle === catalog.flagship ? 'Our flagship panel' : 'Panel', categoryLabel: esc(catLabel), lead: esc(lead),
    metaDescription: esc(`${t.title}: ${lead} ${money(startPrice)}, no referral needed, collected at a partner centre or at home.`.slice(0, 300)),
    priceLabel: money(startPrice), buyUrl: startHref,
    includedHeading: copy.includedHeading || (count === '1' ? 'What this test measures.' : `${count} tests in one collection.`), jsonld
  };
  const photoName = (HERO.products || {})[t.handle];
  const photo = heroPhoto(photoName, `${t.title} home blood collection`, 'object-position: center 25%', { eager: false });
  const slots = { PHOTO: photo ? `<section style="max-width: 1320px; margin: 0 auto; padding: 0 24px 80px"><div style="width: 100%; height: clamp(240px, 40vw, 560px); border-radius: 28px; overflow: hidden; background: #E8EDE6">${photo}</div></section>` : '', FACTS: facts, SUITED: suited, GLANCE: glance, CENTRE_OPTION: centreOption, HOME_OPTION: homeOption, UPGRADE: upgrade, MARKERS: markersHtml, PREP: prepHtml, FAQ: faqHtml, RELATED: related.map((x) => card(x)).join('\n') };
  const html = tpl.replace(/\{\{@(\w+)\}\}/g, (m, k) => (k in vals ? vals[k] : m)).replace(/<!--@([A-Z_]+)-->/g, (m, k) => (k in slots ? slots[k] : m));
  const rel = `tests/${t.handle}.html`;
  writeFileSync(join(OUT, rel), finalize(html, rel));
  pages.push(`/tests/${t.handle}`);
}
if (unmapped.size) console.warn('Note: panel markers without a plain-English description (add to data/markers.json):\n  ' + [...unmapped].join('\n  '));

// ---------- Area pages (local search) ----------
{
  const shell = readFileSync(join(SRC, '_page.html'), 'utf8');
  const AREAS = JSON.parse(readFileSync(join(ROOT, 'data/areas.json'), 'utf8')).areas.filter((a) => a.suburbs.length);
  mkdirSync(join(OUT, 'mobile-blood-collection'), { recursive: true });
  const fromPrice = Math.min(...catalog.tests.map((t) => t.price));
  const H2 = "margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(30px, 3.6vw, 48px); line-height: 1.04; letter-spacing: -0.035em";
  const EYEBROW = 'font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #A4502E';
  const inName = (a) => a.name; // names already carry "the" where needed
  const plain = (a) => a.name.replace(/^the /, '');
  const feeLine = (a) => a.metro.length && a.regional.length ? `${config.metroFee} metro, ${config.regionalFee} regional` : a.metro.length ? config.metroFee : config.regionalFee;
  const render = (vals, body) => finalize(shell.replace(/\{\{@(\w+)\}\}/g, (m, k) => (k in vals ? vals[k] : m)).replace('<!--@BODY-->', body), 'x.html');
  const postcodeForm = (label) => `<form action="${config.bookingUrl}" method="get" style="display: flex; flex-wrap: wrap; gap: 10px; max-width: 520px"><label for="pc-check" class="sr-only">Postcode</label><input id="pc-check" name="postcode" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required placeholder="Enter your postcode" style="flex: 1 1 200px; min-height: 54px; border: 1px solid #D3D8D0; border-radius: 999px; padding: 0 22px; font: inherit; background: #FFFFFF; color: #1C2420"><button type="submit" style="flex: none; min-height: 54px; padding: 0 26px; border: 0; border-radius: 999px; background: #17302A; color: #F7F4EF; font: inherit; font-weight: 700; cursor: pointer">${label}</button></form>`;
  const faqItem = (q, a) => `<details style="border-bottom: 1px solid #DCE0D8; padding: 20px 0"><summary style="display: flex; justify-content: space-between; align-items: center; gap: 16px; font-weight: 700; font-size: 19px; min-height: 44px">${q}<span class="faq-plus" aria-hidden="true" style="font-size: 28px; font-weight: 400; color: #A4502E; transition: transform 0.2s">+</span></summary><p style="margin: 12px 0 0; color: #4B5650">${a}</p></details>`;
  const crumbs = (items) => `<nav aria-label="Breadcrumb" style="max-width: 1320px; margin: 0 auto; padding: 8px 24px 20px; font-size: 14px; color: #5A645E">${items.map(([n, h], i) => (h ? `<a href="${h}" style="color: #5A645E">${esc(n)}</a>` : `<span style="color: #1C2420; font-weight: 600">${esc(n)}</span>`)).join(' / ')}</nav>`;
  const areaCard = (a) => `<a href="/mobile-blood-collection/${a.slug}" style="display: flex; flex-direction: column; gap: 8px; padding: 24px; border-radius: 24px; background: #FFFFFF; border: 1px solid #DCE0D8"><span style="font-size: 13px; font-weight: 700; color: #5A645E">${a.state}</span><span style="font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 22px; letter-spacing: -0.02em">${esc(plain(a).replace(/^./, (c) => c.toUpperCase()))}</span><span style="color: #4B5650; font-size: 15px">${a.suburbs.length} suburbs · ${feeLine(a)}</span></a>`;
  const featuredCards = featured.slice(0, 3).map((t) => card(t)).join('\n');

  for (const a of AREAS) {
    const Name = plain(a).replace(/^./, (c) => c.toUpperCase());
    const path = `/mobile-blood-collection/${a.slug}`;
    const examples = [...new Set(a.suburbs.map((s) => s[0]))];
    const pick = examples.filter((_, i) => i % Math.max(1, Math.floor(examples.length / 6)) === 0).slice(0, 6);
    const faq = [
      [`Do you cover my suburb in ${plain(a)}?`, `We cover ${a.suburbs.length} suburbs across ${inName(a)}, including ${pick.slice(0, 4).join(', ')} and more. Enter your postcode on our <a href="${config.bookingUrl}" style="text-decoration: underline">booking page</a> to confirm straight away.`],
      [`How much is a home blood test in ${plain(a)}?`, `With your own doctor's request form, a home visit is ${feeLine(a)}. If you order a private test from us, adding a home visit costs ${config.homeVisitAddOnFee}.`],
      ['Can the nurse come to my workplace?', 'Yes. A registered nurse can collect at your home or your workplace, whichever suits you.'],
      ['Do I need a referral?', `Not for our private tests. We issue the request form with your order. If your doctor has already given you a request form, upload it when you book.`]
    ];
    const suburbList = a.suburbs.map(([n, pc]) => `<li style="break-inside: avoid; padding: 6px 0; border-bottom: 1px solid #E3E6E0; display: flex; justify-content: space-between; gap: 8px"><span>${esc(n)}</span><span style="color: #5A645E; font-size: 14px">${pc}</span></li>`).join('');
    const body = `${crumbs([['Home', '/'], ['Areas we cover', '/mobile-blood-collection'], [Name]])}
<section style="max-width: 1320px; margin: 0 auto; padding: 0 24px 80px; display: flex; flex-wrap: wrap; align-items: center; gap: 40px 56px">
<div style="flex: 1 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 26px">
<span style="${EYEBROW}">Home blood collection · ${a.state}</span>
<h1 style="margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(40px, 5.2vw, 76px); line-height: 1.0; letter-spacing: -0.04em; max-width: 1000px">Mobile blood collection in ${esc(inName(a))}.</h1>
<p style="margin: 0; font-size: 20px; color: #4B5650; max-width: 720px">A registered nurse collects your blood test at home or at work, across ${a.suburbs.length} suburbs in ${esc(inName(a))}. Use your doctor's request form, or order a private test online with no referral.</p>
${postcodeForm('Check my postcode')}
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); border-top: 1px solid #1C2420; max-width: 900px">
<div style="padding: 18px 18px 18px 0; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 13px; color: #5A645E; font-weight: 600">Suburbs covered</span><span style="font-weight: 700; font-size: 20px">${a.suburbs.length}</span></div>
<div style="padding: 18px; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 13px; color: #5A645E; font-weight: 600">Home visit with your form</span><span style="font-weight: 700; font-size: 20px">${feeLine(a)}</span></div>
<div style="padding: 18px; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 13px; color: #5A645E; font-weight: 600">Private tests</span><span style="font-weight: 700; font-size: 20px">From ${money(fromPrice)}</span></div>
</div>
</div>
<div style="flex: 1 1 400px; min-width: 0; aspect-ratio: 4 / 5; max-height: 560px; border-radius: 28px; overflow: hidden; background: #E8EDE6">${heroPhoto(HERO.areas[0], HERO.areas[1], 'object-position: 72% center', { fallback: true })}</div>
</section>

<section style="background: #E8EDE6"><div style="max-width: 1320px; margin: 0 auto; padding: 88px 24px; display: flex; flex-direction: column; gap: 32px">
<div style="display: flex; flex-direction: column; gap: 14px"><span style="${EYEBROW}">Two ways to book</span><h2 style="${H2}">However you need your test.</h2></div>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 20px">
<div style="background: #FFFFFF; border-radius: 28px; padding: 32px; display: flex; flex-direction: column; gap: 14px"><span style="font-size: 13px; font-weight: 700; color: #A4502E">I have a request form</span><h3 style="margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 28px; letter-spacing: -0.02em">Book a nurse to your door</h3><p style="margin: 0; color: #4B5650">Upload your doctor's pathology request form and choose a time that suits. The home visit fee is ${feeLine(a)}.</p><a href="${config.bookingUrl}" class="btn btn-dark" style="align-self: flex-start; margin-top: auto">Book a home visit</a></div>
<div style="background: #17302A; color: #F7F4EF; border-radius: 28px; padding: 32px; display: flex; flex-direction: column; gap: 14px"><span style="font-size: 13px; font-weight: 700; color: #F2A981">No referral needed</span><h3 style="margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 28px; letter-spacing: -0.02em">Order a private blood test</h3><p style="margin: 0; color: #C5D1CA">Choose from our panels or build your own. Your request form is issued with your order, and a home visit can be added for ${config.homeVisitAddOnFee}.</p><a href="/tests" class="btn" style="align-self: flex-start; margin-top: auto; background: #F2A981; color: #1C2420">Browse blood tests</a></div>
</div>
</div></section>

<section style="max-width: 1320px; margin: 0 auto; padding: 88px 24px 0; display: flex; flex-direction: column; gap: 28px">
<div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px"><h2 style="${H2}">Popular tests in ${esc(inName(a))}.</h2><a href="/tests" style="font-weight: 700; text-decoration: underline">See all tests</a></div>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px">${featuredCards}</div>
</section>

<section style="max-width: 1320px; margin: 0 auto; padding: 88px 24px 0; display: flex; flex-direction: column; gap: 20px">
<h2 style="${H2}">Suburbs we cover in ${esc(inName(a))}.</h2>
<p style="margin: 0; color: #4B5650; max-width: 720px">Home visits are available across these suburbs. If yours is not listed, send a request anyway and our team will check.</p>
<details style="border-top: 1px solid #1C2420; padding-top: 16px"><summary style="font-weight: 700; cursor: pointer; min-height: 44px; display: flex; align-items: center">Show all ${a.suburbs.length} suburbs</summary><ul style="margin: 16px 0 0; padding: 0; list-style: none; columns: 4 220px; column-gap: 32px">${suburbList}</ul></details>
</section>

<section style="max-width: 1320px; margin: 0 auto; padding: 88px 24px; display: flex; flex-wrap: wrap; gap: 48px">
<h2 style="flex: 1 1 320px; margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(30px, 3.6vw, 44px); line-height: 1.04; letter-spacing: -0.035em">Questions</h2>
<div style="flex: 2 1 560px; min-width: 0; display: flex; flex-direction: column; border-top: 1px solid #1C2420">${faq.map(([q, x]) => faqItem(q, x)).join('\n')}</div>
</section>

<section style="max-width: 1320px; margin: 0 auto; padding: 0 24px 96px; display: flex; flex-direction: column; gap: 24px">
<h2 style="margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(26px, 3vw, 36px); letter-spacing: -0.035em">Other areas we cover</h2>
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px">${AREAS.filter((x) => x !== a).map(areaCard).join('\n')}</div>
</section>`;
    const url = siteUrl + path;
    const jsonld = JSON.stringify([
      { '@context': 'https://schema.org', '@type': 'Service', name: `Mobile blood collection in ${plain(a)}`, serviceType: 'Mobile pathology collection', url,
        provider: { '@type': 'Organization', name: 'Express Pathology', url: siteUrl + '/', telephone: config.phone },
        areaServed: { '@type': 'Place', name: `${Name}, ${a.state}, Australia` } },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl + '/' },
        { '@type': 'ListItem', position: 2, name: 'Areas we cover', item: siteUrl + '/mobile-blood-collection' },
        { '@type': 'ListItem', position: 3, name: Name, item: url }] },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, x]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: x.replace(/<[^>]+>/g, '') } })) }
    ]).replace(/</g, '\\u003c');
    const vals = { pageTitle: esc(`Mobile Blood Collection ${Name} | Home Blood Tests | Express Pathology`), path, jsonld,
      metaDescription: esc(`Mobile blood collection in ${inName(a)}. A registered nurse comes to your home or work across ${a.suburbs.length} suburbs. ${feeLine(a)} with your request form, or order a private test with no referral.`) };
    writeFileSync(join(OUT, `mobile-blood-collection/${a.slug}.html`), render(vals, body));
    pages.push(path);
  }

  // Index of all areas
  const byState = ['NSW', 'ACT', 'VIC', 'QLD', 'SA', 'WA', 'NT'].map((st) => [st, AREAS.filter((a) => a.state === st)]).filter(([, l]) => l.length);
  const total = AREAS.reduce((n, a) => n + a.suburbs.length, 0);
  const body = `${crumbs([['Home', '/'], ['Areas we cover']])}
<section style="max-width: 1320px; margin: 0 auto; padding: 0 24px 64px; display: flex; flex-direction: column; gap: 26px">
<span style="${EYEBROW}">Areas we cover</span>
<h1 style="margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(40px, 6vw, 84px); line-height: 1.0; letter-spacing: -0.04em; max-width: 1000px">A nurse at your door, in ${total.toLocaleString('en-AU')}+ suburbs.</h1>
<p style="margin: 0; font-size: 20px; color: #4B5650; max-width: 720px">Mobile blood collection across Australia's major cities and a growing list of regional centres. Enter your postcode to check your address.</p>
${postcodeForm('Check my postcode')}
</section>
<section style="max-width: 1320px; margin: 0 auto; padding: 0 24px 96px; display: flex; flex-direction: column; gap: 40px">
${byState.map(([st, l]) => `<div style="display: flex; flex-direction: column; gap: 16px"><h2 style="margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 28px; letter-spacing: -0.02em; border-top: 1px solid #1C2420; padding-top: 18px">${{ NSW: 'New South Wales', ACT: 'Australian Capital Territory', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia', WA: 'Western Australia', NT: 'Northern Territory' }[st]}</h2><div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px">${l.map(areaCard).join('\n')}</div></div>`).join('\n')}
</section>`;
  const jsonld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Service', name: 'Mobile blood collection', serviceType: 'Mobile pathology collection', url: siteUrl + '/mobile-blood-collection', provider: { '@type': 'Organization', name: 'Express Pathology', url: siteUrl + '/' }, areaServed: AREAS.map((a) => ({ '@type': 'Place', name: `${plain(a).replace(/^./, (c) => c.toUpperCase())}, ${a.state}` })) }).replace(/</g, '\\u003c');
  writeFileSync(join(OUT, 'mobile-blood-collection.html'), render({ pageTitle: 'Mobile Blood Collection Areas | Express Pathology', path: '/mobile-blood-collection', jsonld,
    metaDescription: `Mobile blood collection at home or work across ${total.toLocaleString('en-AU')}+ suburbs in Sydney, Melbourne, Brisbane, Perth, Adelaide, Canberra and regional Australia.` }, body));
  pages.push('/mobile-blood-collection');
}

// Price index for Stripe checkout (server-side source of truth; committed; regenerated each build)
{
  const slugA = (x) => String(x).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fee = (v) => Number(String(v).replace(/[^0-9.]/g, ''));
  const cov = JSON.parse(readFileSync(join(ROOT, 'data/coverage.json'), 'utf8'));
  // Lab test lines for the pathology request form
  const rf = JSON.parse(readFileSync(join(ROOT, 'data/request-form.json'), 'utf8'));
  const missing = catalog.tests.filter((t) => t.centreVariant && !(rf.panels[t.handle] || []).length).map((t) => t.handle);
  if (missing.length) throw new Error('data/request-form.json has no request form lines for: ' + missing.join(', '));
  const idx = {
    panels: Object.fromEntries(catalog.tests.filter((t) => t.centreVariant).map((t) => [t.handle, { title: t.title, price: t.price, lines: rf.panels[t.handle] }])),
    addons: Object.fromEntries(catalog.addons.map((a) => [slugA(a.title), { title: a.title.trim(), price: a.price, lines: [rf.addons[a.title.trim()] || a.title.trim()] }])),
    fasting: rf.fasting,
    builderFee: catalog.base ? catalog.base.price : 0,
    homeVisit: catalog.homeVisit ? catalog.homeVisit.price : null,
    ownForm: { metro: fee(config.metroFee), regional: fee(config.regionalFee) },
    metro: cov.metro || [], regional: cov.regional || []
  };
  writeFileSync(join(ROOT, 'lib/price-index.mjs'), '// Generated by build.mjs from the catalogue and coverage. Do not edit.\nexport default ' + JSON.stringify(idx) + ';\n');
  // Images for the request form PDF, embedded so the serverless function needs no file access
  const img = (f) => readFileSync(join(ROOT, 'data/form', f)).toString('base64');
  writeFileSync(join(ROOT, 'lib/form-assets.mjs'), '// Generated by build.mjs from data/form. Do not edit.\nexport default ' + JSON.stringify({ cyte: img('4cyte.png'), acl: img('acl.png'), healius: img('healius.png'), qr: img('qr-centres.png') }) + ';\n');
}

// Test index for serverless functions (committed; regenerated each build)
writeFileSync(join(ROOT, 'lib/test-index.mjs'), '// Generated by build.mjs. Known public tests for server-side validation.\nexport default ' + JSON.stringify(Object.fromEntries(catalog.tests.map((t) => [t.handle, { title: t.title, price: t.price }])), null, 1) + ';\n');

// ---------- Topic landing pages (search) ----------
{
  const shell = readFileSync(join(SRC, '_page.html'), 'utf8');
  const TOPICS = JSON.parse(readFileSync(join(ROOT, 'data/topics.json'), 'utf8')).topics;
  mkdirSync(join(OUT, 'blood-tests'), { recursive: true });
  const byHandle = Object.fromEntries(catalog.tests.map((t) => [t.handle, t]));
  const H2 = "margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(30px, 3.6vw, 48px); line-height: 1.04; letter-spacing: -0.035em";
  const EYEBROW = 'font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #A4502E';
  const tickT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#17302A" stroke-width="2.4" aria-hidden="true" style="flex: none; margin-top: 3px"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
  const faqItem = (q, a) => `<details style="border-bottom: 1px solid #DCE0D8; padding: 20px 0"><summary style="display: flex; justify-content: space-between; align-items: center; gap: 16px; font-weight: 700; font-size: 19px; min-height: 44px">${esc(q)}<span class="faq-plus" aria-hidden="true" style="font-size: 28px; font-weight: 400; color: #A4502E; transition: transform 0.2s">+</span></summary><p style="margin: 12px 0 0; color: #4B5650">${esc(a)}</p></details>`;
  const shortName = (tp) => tp.label;
  const topicLinks = TOPICS.map((tp) => `<a href="/blood-tests/${tp.slug}" style="padding: 10px 16px; border-radius: 999px; border: 1px solid #D3D8D0; background: #FFFFFF; font-weight: 600; font-size: 15px">${esc(shortName(tp).replace(/^./, (c) => c.toUpperCase()))}</a>`);

  const slugT = (x) => String(x).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const addonByTitle = Object.fromEntries(catalog.addons.map((a) => [a.title.trim().toLowerCase(), a]));
  const builderBlock = (tp) => {
    const items = (tp.builder || []).map((n) => addonByTitle[n.toLowerCase()]).filter(Boolean);
    if (!items.length) return '';
    const href = `/tests?add=${items.map((a) => slugT(a.title)).join(',')}#build`;
    return `<div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 20px; padding: 28px; border-radius: 28px; background: #FFFFFF; border: 1px solid #DCE0D8">
<div style="display: flex; flex-direction: column; gap: 10px; flex: 1 1 420px; min-width: 0"><span style="font-weight: 700; font-size: 20px">Only need one or two tests?</span><span style="color: #4B5650">Choose individual tests in Build Your Own and we combine them into one collection.${catalog.base ? ` A ${money(catalog.base.price)} build-your-own fee applies.` : ''}</span>
<div style="display: flex; flex-wrap: wrap; gap: 8px">${items.map((a) => `<span style="padding: 6px 12px; border-radius: 999px; background: #F7F4EF; font-size: 14px; font-weight: 600">${esc(a.title)} <span style="color: #5A645E; font-weight: 500">${money(a.price)}</span></span>`).join('')}</div></div>
<a href="${href}" class="btn btn-dark" style="flex: none">Build your own</a></div>`;
  };
  for (const tp of TOPICS) {
    const tests = tp.tests.map((h) => byHandle[h]).filter(Boolean);
    if (!tests.length) { console.warn(`Note: topic ${tp.slug} has no available tests; skipped.`); continue; }
    const path = `/blood-tests/${tp.slug}`, url = siteUrl + path;
    const from = Math.min(...tests.map((t) => t.price));
    const markersHtml = tp.markers.map((k) => MK.markers[k]).filter(Boolean).map((m) => `<li style="display: flex; gap: 10px; padding: 14px 0; border-top: 1px solid #DCE0D8">${tickT}<span style="display: flex; flex-direction: column; gap: 2px"><span style="font-weight: 700">${esc(m.name)}</span><span style="color: #4B5650; font-size: 15px">${esc(m.about)}</span></span></li>`).join('');
    const body = `<nav aria-label="Breadcrumb" style="max-width: 1320px; margin: 0 auto; padding: 8px 24px 20px; font-size: 14px; color: #5A645E"><a href="/" style="color: #5A645E">Home</a> / <a href="/tests" style="color: #5A645E">Blood tests</a> / <span style="color: #1C2420; font-weight: 600">${esc(shortName(tp).replace(/^./, (c) => c.toUpperCase()))}</span></nav>
<section style="max-width: 1320px; margin: 0 auto; padding: 0 24px 72px; display: flex; flex-wrap: wrap; align-items: center; gap: 40px 56px">
<div style="flex: 1 1 540px; min-width: 0; display: flex; flex-direction: column; gap: 24px">
<span style="${EYEBROW}">Private blood tests · From ${money(from)}</span>
<h1 style="margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(40px, 6vw, 80px); line-height: 1.0; letter-spacing: -0.04em; max-width: 1000px">${esc(tp.h1)}</h1>
<p style="margin: 0; font-size: 20px; color: #4B5650; max-width: 720px">${esc(tp.intro)}</p>
<div style="display: flex; flex-wrap: wrap; gap: 10px"><a href="#tests" class="btn btn-dark" style="min-height: 52px; padding: 0 24px">See the tests</a><a href="/test-finder" class="btn" style="min-height: 52px; padding: 0 24px; border: 1px solid #1C2420">Help me choose</a></div>
<ul style="margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 10px 28px; color: #4B5650">${['No referral needed', 'Results reviewed by a doctor', '2,000+ collection centres', `Home visit +${config.homeVisitAddOnFee}`].map((x) => `<li style="display: flex; gap: 8px">${tickT}${x}</li>`).join('')}</ul>
</div>
${(() => { const h = (HERO.topics || {})[tp.slug] || []; const img = heroPhoto(h[0], h[1]); return img ? `<div style="flex: 1 1 440px; min-width: 0; aspect-ratio: 4 / 3; border-radius: 28px; overflow: hidden; background: #E8EDE6">${img}</div>` : ''; })()}
</section>

<section id="tests" style="background: #E8EDE6"><div style="max-width: 1320px; margin: 0 auto; padding: 80px 24px; display: flex; flex-direction: column; gap: 28px">
<h2 style="${H2}">Choose your test.</h2>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px">${tests.map((t, i) => card(t, i === 0)).join('\n')}</div>
${builderBlock(tp)}
</div></section>

<section style="max-width: 1320px; margin: 0 auto; padding: 88px 24px 0; display: flex; flex-wrap: wrap; gap: 48px">
${markersHtml ? `<div style="flex: 3 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 18px"><span style="${EYEBROW}">What is measured</span><h2 style="${H2}">What these tests look at.</h2><ul style="margin: 0; padding: 0; list-style: none; border-bottom: 1px solid #DCE0D8">${markersHtml}</ul></div>` : ''}
<div style="flex: 2 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 18px"><span style="${EYEBROW}">Suited to</span><h2 style="${H2}">Who it is for.</h2><ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px">${tp.whoFor.map((w) => `<li style="display: flex; gap: 10px; font-size: 17px">${tickT}${esc(w)}</li>`).join('')}</ul>
<div style="margin-top: 12px; padding: 24px; border-radius: 24px; background: #FBEDE4; display: flex; flex-direction: column; gap: 8px"><span style="font-weight: 700">How it works</span><span style="color: #4B5650">Order online and your request form is issued with your order. Walk in to a partner centre, or add a home visit and a registered nurse comes to you. An Australian doctor reviews your results, and your report is emailed to you.</span></div></div>
</section>

<section style="max-width: 1320px; margin: 0 auto; padding: 88px 24px; display: flex; flex-wrap: wrap; gap: 48px">
<h2 style="flex: 1 1 320px; margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(30px, 3.6vw, 44px); line-height: 1.04; letter-spacing: -0.035em">Questions</h2>
<div style="flex: 2 1 560px; min-width: 0; display: flex; flex-direction: column; border-top: 1px solid #1C2420">${tp.faq.map(([q, a]) => faqItem(q, a)).join('\n')}${faqItem('Is this covered by Medicare?', 'No. Tests ordered without a GP referral are private, so Medicare rebates do not apply.')}</div>
</section>

<section style="max-width: 1320px; margin: 0 auto; padding: 0 24px 96px; display: flex; flex-direction: column; gap: 18px">
<h2 style="margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(24px, 2.6vw, 32px); letter-spacing: -0.03em">Browse other tests</h2>
<div style="display: flex; flex-wrap: wrap; gap: 10px">${topicLinks.filter((_, i) => TOPICS[i] !== tp).join('\n')}</div>
</section>`;
    const faqAll = [...tp.faq, ['Is this covered by Medicare?', 'No. Tests ordered without a GP referral are private, so Medicare rebates do not apply.']];
    const jsonld = JSON.stringify([
      { '@context': 'https://schema.org', '@type': 'ItemList', name: tp.title, itemListElement: tests.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: `${siteUrl}/tests/${t.handle}`, name: t.title })) },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blood tests', item: siteUrl + '/tests' },
        { '@type': 'ListItem', position: 3, name: tp.title, item: url }] },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqAll.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }
    ]).replace(/</g, '\\u003c');
    const vals = { pageTitle: esc(`${tp.title} | From ${money(from)} | Express Pathology`), path, jsonld, metaDescription: esc(`${tp.intro} From ${money(from)}. Results reviewed by an Australian doctor.`.slice(0, 300)) };
    writeFileSync(join(OUT, `blood-tests/${tp.slug}.html`), finalize(shell.replace(/\{\{@(\w+)\}\}/g, (m, k) => (k in vals ? vals[k] : m)).replace('<!--@BODY-->', body), 'x.html'));
    pages.push(path);
  }
}

// ---------- Policy and info pages (moved off Shopify) ----------
{
  const shell = readFileSync(join(SRC, '_page.html'), 'utf8');
  const H1 = "margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(38px, 5vw, 64px); line-height: 1.02; letter-spacing: -0.035em";
  const render = (path, title, desc, body) => {
    const vals = { pageTitle: esc(`${title} | Express Pathology`), path, metaDescription: esc(desc), jsonld: JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: title, url: siteUrl + path }) };
    writeFileSync(join(OUT, path.slice(1) + '.html'), finalize(shell.replace(/\{\{@(\w+)\}\}/g, (m, k) => (k in vals ? vals[k] : m)).replace('<!--@BODY-->', body), 'x.html'));
    pages.push(path);
  };
  for (const [slug, title, desc] of [
    ['privacy-policy', 'Privacy policy', 'How Express Pathology collects, uses and protects your personal information.'],
    ['terms-of-service', 'Terms and conditions', 'The terms on which Express Pathology provides pathology collection and related services.'],
    ['refund-policy', 'Refund policy', 'Express Pathology refund and cancellation conditions.']
  ]) {
    const html = readFileSync(join(ROOT, 'data/policies', slug + '.html'), 'utf8');
    render('/' + slug, title, desc, `<section style="max-width: 820px; margin: 0 auto; padding: 32px 24px 96px; display: flex; flex-direction: column; gap: 24px">
<h1 style="${H1}">${esc(title)}</h1>
<div class="prose">${html}</div>
</section>`);
  }
  const states = [['NSW', 'https://www.4cyte.com.au/Locations', '4Cyte Pathology'], ['VIC', 'https://www.4cyte.com.au/Locations', '4Cyte Pathology'], ['QLD', 'https://www.4cyte.com.au/Locations', '4Cyte Pathology'], ['ACT', 'https://www.4cyte.com.au/Locations', '4Cyte Pathology'], ['SA', 'https://www.clinicallabs.com.au/location', 'Australian Clinical Labs'], ['WA', 'https://www.clinicallabs.com.au/location', 'Australian Clinical Labs'], ['NT', 'https://www.clinicallabs.com.au/location', 'Australian Clinical Labs']];
  render('/collection-centres', 'Collection centres', 'Find a NATA-accredited partner pathology collection centre near you in any Australian state or territory.', `<section style="max-width: 1100px; margin: 0 auto; padding: 32px 24px 96px; display: flex; flex-direction: column; gap: 28px">
<span style="font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #A4502E">Walk-in collection</span>
<h1 style="${H1}">Find a collection centre near you.</h1>
<p style="margin: 0; font-size: 19px; color: #4B5650; max-width: 720px">We partner with NATA-accredited pathology laboratories to provide collection centres across every Australian state and territory. Choose your state to find your nearest centre, and bring the request form issued with your order.</p>
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px">${states.map(([s, u, lab]) => `<a href="${u}" target="_blank" rel="noopener" style="display: flex; flex-direction: column; gap: 6px; padding: 24px; border-radius: 24px; background: #FFFFFF; border: 1px solid #DCE0D8"><span style="font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 28px">${s}</span><span style="color: #4B5650">${lab} locations →</span></a>`).join('\n')}</div>
<p style="margin: 0; color: #4B5650">Prefer not to travel? <a href="/mobile-blood-collection" style="text-decoration: underline">A registered nurse can come to you</a>.</p>
</section>`);
}

// Coverage for the request form
const cov = JSON.parse(readFileSync(join(ROOT, 'data/coverage.json'), 'utf8'));
writeFileSync(join(OUT, 'assets/coverage.json'), JSON.stringify({ metro: cov.metro || [], regional: cov.regional || [], metroFee: config.metroFee, regionalFee: config.regionalFee, store: catalog.store, ownForm: catalog.ownForm }));
if (!(cov.metro || []).length) console.warn('Note: data/coverage.json has no postcodes yet; the request form will not show coverage.');

// Builder data for the browser
{
  const slugB = (x) => String(x).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  writeFileSync(join(OUT, 'assets/catalog.json'), JSON.stringify({
    addons: catalog.addons.map((a) => ({ ...a, slug: slugB(a.title) })), homeVisit: catalog.homeVisit, base: catalog.base,
    panels: Object.fromEntries(catalog.tests.filter((t) => t.centreVariant).map((t) => [t.handle, { title: t.title, price: t.price, count: displayNames(t).length }]))
  }));
}

if (problems.length) {
  console.error('\nBuild stopped. These would have gone live:\n  - ' + problems.join('\n  - ') + '\n');
  process.exit(1);
}

const site = config.siteUrl.replace(/\/$/, '');
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.sort().map((p) => `  <url><loc>${site}${p === '/' ? '/' : p}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /checkout\nDisallow: /order-confirmed\nDisallow: /partner-referral\nSitemap: ${site}/sitemap.xml\n`);
console.log(`Built ${pages.length} pages into dist/`);
