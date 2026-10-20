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
function summary(t, n = 3) {
  const m = t.markers;
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
for (const t of catalog.tests) {
  const catLabel = CATEGORY_LABELS[primaryCat(t)];
  const lead = t.blurb || (t.kind === 'panel'
    ? `A ${t.markers.length}-part ${catLabel.toLowerCase()} panel with no referral needed. Collected at a partner centre or by a registered nurse at your home.`
    : `A private ${t.title.replace(/ test$/i, '')} test with no referral needed. Collected at a partner centre or by a registered nurse at your home.`);
  const centreOption = t.centreVariant
    ? `<label style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 18px; border-radius: 18px; border: 1px solid #D3D8D0; cursor: pointer"><span style="display: flex; gap: 12px; align-items: center"><input type="radio" name="pp-mode" value="centre" checked data-href="${cartUrl(t.centreVariant)}" data-price="${money(t.price)}" style="width: 20px; height: 20px; accent-color: #17302A"><span style="display: flex; flex-direction: column"><span style="font-weight: 700">Walk-in centre</span><span style="font-size: 14px; color: #4B5650">2,000+ partner centres</span></span></span><span style="font-weight: 700">Included</span></label>`
    : '<p style="margin: 0; font-size: 14px; color: #4B5650">This test is currently available with a home visit only.</p>';
  const homeOption = t.homeVariant
    ? `<label style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 18px; border-radius: 18px; border: 1px solid #D3D8D0; cursor: pointer"><span style="display: flex; gap: 12px; align-items: center"><input type="radio" name="pp-mode" value="home"${t.centreVariant ? '' : ' checked'} data-href="${cartUrl(t.homeVariant)}" data-price="${money(t.homePrice)}" style="width: 20px; height: 20px; accent-color: #17302A"><span style="display: flex; flex-direction: column"><span style="font-weight: 700">Nurse at home</span><span style="font-size: 14px; color: #4B5650">Home or workplace visit</span></span></span><span style="font-weight: 700">${t.centreVariant ? '+' + money(Math.round((t.homePrice - t.price) * 100) / 100) : 'Included'}</span></label>`
    : '<p style="margin: 0; font-size: 14px; color: #4B5650">Need a home visit for this test? <a href="/book" style="text-decoration: underline">Request a nurse</a>.</p>';
  const markersHtml = t.markers.map((m) => `<li style="padding: 14px 16px 14px 0; border-bottom: 1px solid #D3D8D0; display: flex; gap: 10px; align-items: flex-start"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#17302A" stroke-width="2.4" aria-hidden="true" style="flex: none; margin-top: 3px"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>${esc(m)}</li>`).join('\n');
  const related = catalog.tests.filter((x) => x.handle !== t.handle && x.cats.includes(primaryCat(t))).sort((a, b) => (b.kind === t.kind) - (a.kind === t.kind) || Math.abs(a.price - t.price) - Math.abs(b.price - t.price)).slice(0, 3);
  const jsonld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: t.title, description: lead, url: `${siteUrl}/tests/${t.handle}`,
    brand: { '@type': 'Brand', name: 'Express Pathology' },
    offers: { '@type': 'Offer', priceCurrency: 'AUD', price: t.price.toFixed(2), availability: 'https://schema.org/InStock', url: `${siteUrl}/tests/${t.handle}` } }).replace(/</g, '\\u003c');
  const vals = {
    title: esc(t.title), handle: t.handle, kindLabel: t.kind === 'panel' ? 'Panel' : 'Single test', categoryLabel: esc(catLabel), lead: esc(lead),
    metaDescription: esc(`${t.title}: ${t.kind === 'panel' ? summary(t, 4) : 'private blood test'} No referral needed. ${money(t.price)}, collected at a partner centre or at home.`.slice(0, 300)),
    countLabel: t.markers.length === 1 ? '1 test' : `${t.markers.length} tests`, priceLabel: money(t.price), buyUrl: cartUrl(t.centreVariant || t.homeVariant),
    includedHeading: t.markers.length === 1 ? 'What this test measures.' : `${t.markers.length} tests in one collection.`, jsonld
  };
  let html = tpl.replace(/\{\{@(\w+)\}\}/g, (m, k) => (k in vals ? vals[k] : m))
    .replace('<!--@CENTRE_OPTION-->', centreOption).replace('<!--@HOME_OPTION-->', homeOption).replace('<!--@MARKERS-->', markersHtml)
    .replace('<!--@RELATED-->', related.map((x) => card(x)).join('\n'));
  const rel = `tests/${t.handle}.html`;
  writeFileSync(join(OUT, rel), finalize(html, rel));
  pages.push(`/tests/${t.handle}`);
}

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
