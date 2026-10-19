// Build: copies src/ to dist/, fills {{tokens}} from site.config.json, adds
// analytics, sitemap and robots, and refuses to build if any required value is
// missing or any placeholder text would reach the live site.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'dist');
const config = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const OPTIONAL = new Set(['abn', 'supportHours', 'shopifyHomeVisitVariantId', 'gaMeasurementId', 'metaPixelId']);

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

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(SRC, p);
    const dest = join(OUT, rel);
    if (statSync(p).isDirectory()) { mkdirSync(dest, { recursive: true }); walk(p); continue; }
    if (extname(name) !== '.html') { copyFileSync(p, dest); continue; }
    let html = readFileSync(p, 'utf8');
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
    writeFileSync(dest, html);
    if (name !== '404.html') pages.push(rel === 'index.html' ? '/' : '/' + rel.replace(/\.html$/, ''));
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
walk(SRC);

if (problems.length) {
  console.error('\nBuild stopped. These would have gone live:\n  - ' + problems.join('\n  - ') + '\n');
  process.exit(1);
}

const site = config.siteUrl.replace(/\/$/, '');
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.sort().map((p) => `  <url><loc>${site}${p === '/' ? '/' : p}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${site}/sitemap.xml\n`);
console.log(`Built ${pages.length} pages into dist/`);
