// Loads the Shopify catalogue for the build: public tests and panels, builder add-ons,
// and the home visit add-on. Reads the store's public product feed; falls back to the
// committed snapshot if the store cannot be reached.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const decode = (s) => String(s || '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
});
const strip = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function markers(bodyHtml) {
  const body = String(bodyHtml || '');
  let parts = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
  if (!parts.length) parts = body.split(/<br\s*\/?>|<\/p>|\n/i);
  const out = [];
  for (const p of parts) for (const piece of strip(p).split(/\s*<br>\s*/)) if (piece) out.push(piece);
  return [...new Set(out)];
}

async function fetchFeed(store) {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(`https://${store}/products.json?limit=250&page=${page}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error('feed ' + r.status);
    const j = await r.json();
    all.push(...j.products);
    if (j.products.length < 250) break;
  }
  return all;
}

const CATS = [
  ['mens', "Men's health"], ['womens', "Women's health"], ['hormones', 'Hormones'], ['thyroid', 'Thyroid'],
  ['vitamins', 'Vitamins and iron'], ['heart', 'Heart and metabolic'], ['sexual', 'Sexual health'], ['general', 'General health'], ['longevity', 'Longevity']
];
export const CATEGORY_LABELS = Object.fromEntries(CATS);
export const CATEGORY_ORDER = CATS.map((c) => c[0]);

function categories(p, items) {
  const text = [p.title, ...items].join(' ').toLowerCase();
  const tags = p.tags.map((t) => t.toLowerCase());
  const c = new Set();
  if (tags.includes("men's health") || /\bpsa\b|prostate|\bmen'?s\b|male/.test(text)) c.add('mens');
  if (tags.includes("women's health") || /women|female/.test(text)) c.add('womens');
  if (tags.includes('sexual health') || /\bsti\b|\bhiv\b|hep [bc]|chlamydia|syphilis|herpes|gonorr/.test(text)) c.add('sexual');
  if (/testosterone|oestradiol|estradiol|progesterone|prolactin|\bfsh\b|\blh\b|shbg|cortisol|dhea|igf|hormon/.test(text)) c.add('hormones');
  if (/thyroid|\btsh\b|\bt3\b|\bt4\b/.test(text)) c.add('thyroid');
  if (/vitamin|\bb12\b|folate|iron|ferritin|zinc|copper|magnesium/.test(text)) c.add('vitamins');
  if (/cholesterol|lipid|glucose|hba1c|insulin|\bcrp\b|cardio|apo|lp ?\(a\)|homocysteine/.test(text)) c.add('heart');
  if (/longevity/.test(text)) c.add('longevity');
  if (/general|core health|liver|kidney|blood count|biochem|wellness|complete/.test(text) || !c.size) c.add('general');
  return CATEGORY_ORDER.filter((k) => c.has(k));
}

function variantFor(p, kind) {
  const vs = p.variants.filter((v) => v.available !== false);
  const home = vs.find((v) => /home|workplace/i.test(v.title));
  const centre = vs.find((v) => /cent(er|re)|visit one of/i.test(v.title)) || vs.find((v) => v !== home && !/home|workplace/i.test(v.title)) || null;
  return kind === 'home' ? home : centre;
}

export async function loadCatalog(root) {
  const cfg = JSON.parse(readFileSync(join(root, 'data/catalog.config.json'), 'utf8'));
  let products, source = 'live';
  try { products = await fetchFeed(cfg.store); writeFileSync(join(root, 'data/products.snapshot.json'), JSON.stringify({ products })); }
  catch (e) { products = JSON.parse(readFileSync(join(root, 'data/products.snapshot.json'), 'utf8')).products; source = 'snapshot (' + e.message + ')'; }
  const overrides = (() => { try { return JSON.parse(readFileSync(join(root, 'data/product-overrides.json'), 'utf8')); } catch { return {}; } })();
  const exclude = new Set(cfg.exclude);
  const byHandle = Object.fromEntries(products.map((p) => [p.handle, p]));

  const toTest = (p) => {
    const o = overrides[p.handle] || {};
    const items = o.markers || markers(p.body_html);
    const centre = variantFor(p, 'centre'), home = variantFor(p, 'home');
    if (!centre && !home) return null;
    const price = parseFloat((centre || home).price);
    return {
      handle: p.handle, title: o.title || p.title.replace(/\s+/g, ' ').trim(), markers: items,
      price, homePrice: home ? parseFloat(home.price) : null,
      centreVariant: centre ? centre.id : null, homeVariant: home ? home.id : null, homeOnly: !centre,
      kind: price >= cfg.panelMinPrice ? 'panel' : 'single',
      cats: o.categories || categories(p, items),
      image: p.images && p.images[0] ? p.images[0].src : null,
      blurb: o.blurb || null
    };
  };

  const pub = products.filter((p) => (p.tags.includes('Shop All') || cfg.includeExtra.includes(p.handle)) && !exclude.has(p.handle))
    .map(toTest).filter(Boolean).sort((a, b) => a.price - b.price || a.title.localeCompare(b.title));
  const addons = products.filter((p) => (p.tags.includes('hidden') || cfg.builderExtra.includes(p.handle)) && !exclude.has(p.handle) && !pub.find((x) => x.handle === p.handle))
    .map((p) => { const v = p.variants[0]; const items = markers(p.body_html); return { id: v.id, title: p.title.trim(), price: parseFloat(v.price), cat: categories(p, items)[0] }; })
    .sort((a, b) => a.title.localeCompare(b.title));
  const hv = byHandle[cfg.builderHomeVisitHandle];
  const base = byHandle[cfg.builderBaseHandle];
  return {
    source, store: cfg.store, featured: cfg.featured,
    tests: pub, addons,
    homeVisit: hv ? { id: hv.variants[0].id, price: parseFloat(hv.variants[0].price) } : null,
    base: base ? { id: base.variants[0].id, price: parseFloat(base.variants[0].price), title: base.title } : null
  };
}
