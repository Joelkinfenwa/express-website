// Pathology request form PDF for a paid order. A port of the Order Printer Pro template
// "Universal Commercial Request Form v13": same sections, wording, lab codes and palette,
// drawn with pdf-lib so it runs in a serverless function without a browser.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import ASSETS from './form-assets.mjs';

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const RED = hex('#C8102E'), PINK = hex('#FDECEF'), INK = hex('#1A1A1A'), GREY = hex('#6A6A6A'), MID = hex('#4A4A4A'),
  LINE = hex('#D4D4D4'), RULE = hex('#B8B8B8'), PAPER = hex('#FAFAFA'), WHITE = rgb(1, 1, 1);

const EMAIL = 'express@expresspathology.com.au', PHONE = '02 9545 2940';
// Laboratory, Dr code, billing code (unchanged from the Order Printer Pro form)
const LAB_CODES = [
  ['4Cyte Pathology', '9EXP', '9EXP'], ['Australian Clinical Labs', 'BR479', 'N1687'], ['Abbott Pathology', '9EXP', '9EXP'],
  ['Dorevitch Pathology', '9EXP', '9EXP'], ['Laverty Pathology', '9EXP', '9EXP'], ['QML Pathology', '9EXP', '9EXP'],
  ['TML Pathology', '9EXP', '9EXP'], ['Western Diagnostic Pathology', '9EXP', '9EXP']
];

// Helvetica only encodes Windows-1252; replace anything else so a name never breaks the PDF.
const WIN = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);
const clean = (s) => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[\u0000-\u001f]/g, ' ').replace(/[^ -~ -ÿ]/g, (c) => (WIN.has(c) ? c : '?'));

export function formatDob(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
export function formatPhone(v) {
  let d = String(v || '').replace(/[^\d]/g, '');
  if (d.startsWith('61')) d = '0' + d.slice(2);
  if (d.length !== 10) return String(v || '').trim();
  return d.startsWith('04') ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
}
const sexCode = (s) => ({ female: 'F', f: 'F', male: 'M', m: 'M' }[String(s || '').trim().toLowerCase()] || String(s || '').trim());

/**
 * order = { reference, patient: { firstName, lastName, dob, sex, phone, address, suburb, state, postcode },
 *           items: [{ title, lines: [] }], fasting: boolean }
 * Returns a Uint8Array (PDF bytes).
 */
export async function requestFormPdf(order) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Pathology request form ${order.reference}`);
  pdf.setAuthor('Express Pathology');
  pdf.setCreator('expresspathology.com.au');
  const R = await pdf.embedFont(StandardFonts.Helvetica), B = await pdf.embedFont(StandardFonts.HelveticaBold);
  const png = async (b64) => pdf.embedPng(Buffer.from(b64, 'base64'));
  const img = { cyte: await png(ASSETS.cyte), acl: await png(ASSETS.acl), healius: await png(ASSETS.healius), qr: await png(ASSETS.qr) };

  const PW = 595.28, PH = 841.89, M = 18, PAD = 10;
  const X0 = M + PAD, W = PW - 2 * (M + PAD);
  let page, y;

  // Drawing helpers, with y measured from the top of the page
  const rect = (x, top, w, h, o = {}) => page.drawRectangle({ x, y: PH - top - h, width: w, height: h, color: o.fill, borderColor: o.border, borderWidth: o.border ? (o.bw || 0.75) : 0 });
  const hline = (x, top, w, c = INK, t = 0.75) => page.drawLine({ start: { x, y: PH - top }, end: { x: x + w, y: PH - top }, thickness: t, color: c });
  const width = (s, f, size) => f.widthOfTextAtSize(clean(s), size);
  const fit = (s, f, size, max) => { let t = clean(s); if (f.widthOfTextAtSize(t, size) <= max) return t; while (t && f.widthOfTextAtSize(t + '...', size) > max) t = t.slice(0, -1); return t + '...'; };
  const text = (s, x, top, size, f = R, c = INK, o = {}) => {
    let t = o.max ? fit(s, f, size, o.max) : clean(s);
    let dx = x;
    if (o.align === 'right') dx = x - f.widthOfTextAtSize(t, size);
    if (o.align === 'center') dx = x - f.widthOfTextAtSize(t, size) / 2;
    page.drawText(t, { x: dx, y: PH - top - size * 0.78, size, font: f, color: c });
  };
  const wrap = (s, f, size, max) => {
    const out = []; let line = '';
    for (const w of clean(s).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (f.widthOfTextAtSize(t, size) > max && line) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line); return out;
  };
  const label = (s, x, top, c = GREY) => text(s.toUpperCase(), x, top, 6.5, B, c);
  const tick = (x, top, s = 8) => {
    rect(x, top, s, s, { fill: PINK, border: RED, bw: 0.9 });
    page.drawLine({ start: { x: x + s * 0.2, y: PH - top - s * 0.55 }, end: { x: x + s * 0.42, y: PH - top - s * 0.78 }, thickness: 1.1, color: RED });
    page.drawLine({ start: { x: x + s * 0.42, y: PH - top - s * 0.78 }, end: { x: x + s * 0.82, y: PH - top - s * 0.22 }, thickness: 1.1, color: RED });
  };
  const newPage = () => { page = pdf.addPage([PW, PH]); rect(M, M, PW - 2 * M, PH - 2 * M, { border: RED, bw: 1.5 }); y = M + PAD; };

  // ---------- PAGE 1: REQUEST FORM ----------
  newPage();
  const p = order.patient || {};

  // Header
  text('Express Pathology', X0, y, 18, B, RED);
  text('COMMERCIAL PATHOLOGY REQUEST FORM', X0, y + 21, 7, R, GREY);
  text(EMAIL, X0 + W, y + 8, 7, R, GREY, { align: 'right' });
  text(PHONE, X0 + W, y + 18, 7, R, GREY, { align: 'right' });
  y += 31; hline(X0, y, W, RED, 1.5); y += 5;

  // Participating labs
  rect(X0, y, W, 26, { fill: PAPER, border: LINE });
  text('PARTICIPATING', X0 + 8, y + 7, 6.5, B, RED); text('LABS', X0 + 8, y + 14.5, 6.5, B, RED);
  {
    const h = 14;
    let x = X0 + W + 2;
    for (const im of [img.healius, img.acl, img.cyte]) {
      const hh = im === img.cyte ? h + 2 : h - 1, w = im.width * hh / im.height; x -= w + 12;
      page.drawImage(im, { x, y: PH - y - 13 - hh / 2, width: w, height: hh });
    }
  }
  y += 31;

  // Billing notice
  rect(X0, y, W, 36, { fill: WHITE, border: RED, bw: 1.5 }); rect(X0, y, 4, 36, { fill: RED });
  text('COMMERCIAL ACCOUNT · BILL TO EXPRESS PATHOLOGY · DO NOT BILL THE PATIENT', X0 + 14, y + 8, 9.5, B, RED, { max: W - 22 });
  text('The patient has paid Express Pathology in full. Bill the laboratory using the codes in the bottom-left of this form.', X0 + 14, y + 22, 7.5, R, INK, { max: W - 22 });
  y += 41;

  // Compliance strip
  rect(X0, y, W, 17, { fill: INK });
  text('COMMERCIAL / NON-MEDICARE', X0 + 9, y + 5, 7.5, B, WHITE);
  text('THIS FORM IS ONLY TO BE ACCEPTED AT ONE OF THE LABORATORIES LISTED ABOVE', X0 + W - 9, y + 5.5, 6.5, R, WHITE, { align: 'right' });
  y += 17;
  rect(X0, y, W, 15, { fill: PAPER, border: LINE });
  text('Collector + D/E — Do not alter the ID details on this referral. It is meant to be as is.', X0 + 9, y + 4.5, 7.5, R, MID);
  y += 20;

  // Patient block
  {
    const c0 = 74, c3 = 92, rest = W - c0 - c3, c1 = rest / 2, c2 = rest - c1, rh = 30;
    const xs = [X0, X0 + c0, X0 + c0 + c1, X0 + c0 + c1 + c2];
    rect(X0, y, W, rh * 2, { border: LINE });
    rect(X0, y, c0, rh, { fill: PINK });
    page.drawLine({ start: { x: xs[1], y: PH - y }, end: { x: xs[1], y: PH - y - rh }, thickness: 0.75, color: LINE });
    page.drawLine({ start: { x: xs[2], y: PH - y }, end: { x: xs[2], y: PH - y - rh }, thickness: 0.75, color: LINE });
    page.drawLine({ start: { x: xs[3], y: PH - y }, end: { x: xs[3], y: PH - y - 2 * rh }, thickness: 0.75, color: LINE });
    hline(X0, y + rh, W, LINE);
    text('ORDER #', X0 + c0 / 2, y + 6, 6.5, B, RED, { align: 'center' });
    text(String(order.reference || '').replace(/^#/, ''), X0 + c0 / 2, y + 15, 10, B, RED, { align: 'center', max: c0 - 6 });
    label('Patient Surname', xs[1] + 8, y + 6); text(String(p.lastName || '').toUpperCase(), xs[1] + 8, y + 15.5, 10, B, INK, { max: c1 - 14 });
    label('Patient First Name', xs[2] + 8, y + 6); text(String(p.firstName || '').toUpperCase(), xs[2] + 8, y + 15.5, 10, B, INK, { max: c2 - 14 });
    label('D.O.B', xs[3] + 7, y + 6); text(formatDob(p.dob) || '__ / __ / ____', xs[3] + 7, y + 15.5, 9.5, R, INK);
    const y2 = y + rh, addrW = c0 + c1, phoneX = X0 + addrW;
    page.drawLine({ start: { x: phoneX, y: PH - y2 }, end: { x: phoneX, y: PH - y2 - rh }, thickness: 0.75, color: LINE });
    label('Patient Address', X0 + 8, y2 + 6);
    text([p.address, p.suburb, p.state, p.postcode].filter(Boolean).join(' '), X0 + 8, y2 + 15.5, 9, R, INK, { max: addrW - 14 });
    label('Phone', phoneX + 8, y2 + 6); text(formatPhone(p.phone), phoneX + 8, y2 + 15.5, 9.5, R, INK, { max: c2 - 14 });
    label('Sex', xs[3] + 7, y2 + 6); text(sexCode(p.sex) || '__', xs[3] + 7, y2 + 15.5, 10, B, INK, { max: 34 });
    label('Fasting', xs[3] + 42, y2 + 6);
    if (order.fasting) tick(xs[3] + 42, y2 + 15.5, 9); else rect(xs[3] + 42, y2 + 15.5, 9, 9, { fill: WHITE, border: RED, bw: 1 });
    text('YES', xs[3] + 55, y2 + 17, 7, R, GREY);
    y += rh * 2 + 5;
  }

  // Tests requested
  {
    rect(X0, y, W, 15, { fill: PINK, border: LINE }); text('TESTS REQUESTED', X0 + 9, y + 4.5, 7.5, B, RED); y += 15;
    const items = order.items || [];
    const counts = new Map();
    for (const it of items) for (const l of it.lines || []) { const k = clean(l).trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
    const unique = [...counts.keys()];
    const titleLines = []; // panel names are deliberately not printed; the lab works from the test lines
    const per = Math.ceil(unique.length / 3) || 0, colW = (W - 18) / 3, lh = 12.5;
    const bodyH = Math.max(80, 10 + titleLines.length * 12 + 4 + per * lh + 6);
    rect(X0, y, W, bodyH, { fill: WHITE, border: LINE });
    let ty = y + 8;
    for (const t of titleLines) { text(t, X0 + 9, ty, 8.5, B, RED, { max: W - 18 }); ty += 12; }
    ty += 3;
    unique.forEach((l, i) => {
      const col = Math.floor(i / per), row = i % per, cx = X0 + 9 + col * colW, cy = ty + row * lh;
      tick(cx, cy, 8);
      const n = counts.get(l);
      text((n > 1 ? n + '× ' : '') + l, cx + 12, cy + 0.5, 7.8, R, INK, { max: colW - 16 });
    });
    y += bodyH + 5;
  }

  // Notes (left blank for the collector, as on the original form)
  rect(X0, y, W, 15, { fill: PINK, border: LINE }); text('NOTES', X0 + 9, y + 4.5, 7.5, B, RED); y += 15;
  rect(X0, y, W, 32, { fill: WHITE, border: LINE }); y += 37;

  // Bottom: lab codes (left), referrer and collection fields (right)
  {
    const half = (W - 9) / 2, rx = X0 + half + 9, rowH = 13.5;
    const cw = [half - 58 - 62, 58, 62];
    rect(X0, y, half, 15, { fill: RED });
    text('LABORATORY', X0 + 6, y + 5, 6.8, B, WHITE); text('DR CODE', X0 + cw[0] + 6, y + 5, 6.8, B, WHITE); text('BILLING CODE', X0 + cw[0] + cw[1] + 6, y + 5, 6.8, B, WHITE);
    LAB_CODES.forEach((r, i) => {
      const ry = y + 15 + i * rowH;
      rect(X0, ry, half, rowH, { fill: i % 2 ? PINK : WHITE });
      text(r[0], X0 + 6, ry + 3.5, 7.5, B, RED, { max: cw[0] - 8 });
      text(r[1], X0 + cw[0] + 6, ry + 3.5, 7.5, R, INK); text(r[2], X0 + cw[0] + cw[1] + 6, ry + 3.5, 7.5, R, INK);
    });
    const tableH = 15 + LAB_CODES.length * rowH;
    rect(X0, y, half, tableH, { border: RED });

    rect(rx, y, half, 50, { fill: PAPER, border: LINE });
    text('REFERRER', rx + 9, y + 8, 7, B, RED);
    text('Express Pathology Pty Ltd', rx + 9, y + 19, 10, B, INK);
    text(`${EMAIL} · ${PHONE}`, rx + 9, y + 33, 7.3, R, GREY, { max: half - 18 });
    const fy = y + 50, fh = tableH - 50;
    rect(rx, fy, half, fh, { border: LINE });
    label('Collection Date', rx + 9, fy + 20); hline(rx + 85, fy + 27, half - 95, RULE);
    label('Collection Time', rx + 9, fy + 46); hline(rx + 85, fy + 53, half - 95, RULE);
    y += tableH + 5;
  }

  // Collector signature
  {
    const h = 72;
    rect(X0, y, W, h, { border: RED, bw: 1.2 });
    text('COLLECTOR SIGNATURE', X0 + 9, y + 8, 8.5, B, RED);
    wrap('I certify that I collected the accompanying sample from the patient named above whose identity I confirmed by enquiry, and labelled the sample immediately following collection.', R, 7.3, W - 18)
      .forEach((l, i) => text(l, X0 + 9, y + 21 + i * 9.5, 7.3, R, GREY));
    const sy = y + 46, cols = [[0, 0.4, 'SIGN'], [0.4, 0.4, 'PRINT NAME'], [0.8, 0.2, 'DATE']];
    for (const [f, w, l] of cols) { const cx = X0 + 9 + f * (W - 18); text(l, cx, sy, 6.8, B, GREY); hline(cx, sy + 18, w * (W - 18) - 12, INK); }
    y += h + 5;
  }

  // Footer banner
  rect(X0, y, W, 20, { fill: RED });
  text('DO NOT BILL THE PATIENT · PATIENT HAS PAID IN FULL · BILL EXPRESS PATHOLOGY USING THE CODES ABOVE', X0 + W / 2, y + 6.5, 8, B, WHITE, { align: 'center', max: W - 16 });

  // ---------- PAGE 2: COLLECTOR INSTRUCTIONS ----------
  newPage();
  rect(X0, y, W, 24, { fill: RED });
  text('COMMERCIAL PATHOLOGY REQUEST FORM', X0 + 10, y + 8, 9, B, WHITE); text('EXPRESS PATHOLOGY', X0 + W - 10, y + 8, 9, B, WHITE, { align: 'right' });
  y += 36;
  text('FIND YOUR NEAREST COLLECTION CENTRE', X0, y, 10, B, RED); y += 14;
  text('Please visit expresspathology.com.au/collection-centres', X0, y, 8.5, R, INK); y += 20;
  page.drawImage(img.qr, { x: X0 + W / 2 - 52, y: PH - y - 104, width: 104, height: 104 }); y += 110;
  text('Scan to find your nearest collection centre', X0 + W / 2, y, 7.5, R, GREY, { align: 'center' }); y += 24;

  text('FOR THE ATTENTION OF PHLEBOTOMIST / COLLECTOR', X0, y, 10, B, RED); y += 17;
  const paras = [
    [['Thank you', B, RED], [' for taking care of our Express Pathology customers. Without you we would not be able to provide this service to our customers in Australia.', R, INK]],
    [['Express Pathology has commercial accounts with the laboratories listed below and the customer has already paid for this test in full.', R, INK]],
    [['If you need anything clarified please contact your laboratory\'s commercial department or area coordinator, or reach Express Pathology on ', R, INK], [PHONE.replace(/ /g, '\u00a0'), B, INK], ['.', R, INK]],
    [['This pathology request form is only valid at the collection centres of the following participating laboratories and should not be submitted to, nor accepted by, any other laboratory than:', R, INK]]
  ];
  for (const runs of paras) {
    // Word-wrap mixed runs
    const words = runs.flatMap(([s, f, c]) => clean(s).split(/(\s+)/).filter((w) => w !== '').map((w) => [w, f, c]));
    let x = X0, lineTop = y;
    for (const [w, f, c] of words) {
      const ww = f.widthOfTextAtSize(w, 8.5);
      if (/^\s+$/.test(w)) { if (x > X0) x += ww; continue; }
      if (x + ww > X0 + W) { x = X0; lineTop += 13; }
      page.drawText(w, { x, y: PH - lineTop - 8.5 * 0.78, size: 8.5, font: f, color: c }); x += ww;
    }
    y = lineTop + 20;
  }
  y += 2;
  const bullet = (s, x, top, size = 8.5) => { text('•', x, top, size, B, RED); text(s, x + 10, top, size, B, INK); };
  bullet('4Cyte Pathology Pty Ltd', X0, y);
  bullet('Australian Clinical Labs', X0, y + 15);
  bullet('Healius Pathology Pty Ltd', X0, y + 30);
  ['Laverty Pathology', 'Western Diagnostic Pathology', 'Dorevitch Pathology', 'QML Pathology', 'TML Pathology', 'Abbott Pathology']
    .forEach((s, i) => text('· ' + s, X0 + 14, y + 45 + i * 12, 8, R, INK));
  y += 45 + 6 * 12 + 18;

  rect(X0, y, W, 40, { fill: RED });
  text('Express Pathology has commercial accounts with the laboratories above.', X0 + W / 2, y + 9, 8.5, B, WHITE, { align: 'center' });
  text('THE CUSTOMER HAS ALREADY PAID FOR THIS TEST IN FULL · DO NOT BILL THE PATIENT', X0 + W / 2, y + 23, 8.5, B, WHITE, { align: 'center', max: W - 16 });
  y += 58;
  hline(X0, y, W, RED, 0.75); y += 8;
  text('COLLECTION CENTRES — NOTE TO CUSTOMER', X0, y, 7, B, RED);
  text('Only attend collection centres listed on expresspathology.com.au to avoid being billed for this test again.', X0, y + 11, 7, R, GREY);
  text(EMAIL, X0 + W, y, 7.5, B, INK, { align: 'right' }); text(PHONE, X0 + W, y + 11, 7.5, B, INK, { align: 'right' });

  return pdf.save();
}

// Builds the form input from a paid Stripe Checkout Session's metadata and the price index.
export function orderFromSession(s, PRICES) {
  const m = s.metadata || {};
  const items = [];
  if (m.order_type === 'panel' && PRICES.panels[m.panel]) items.push({ title: PRICES.panels[m.panel].title, lines: PRICES.panels[m.panel].lines });
  if (m.order_type === 'builder') {
    const slugs = [m.tests, m.tests_2, m.tests_3].filter(Boolean).join(',').split(',').filter(Boolean);
    const chosen = slugs.map((x) => PRICES.addons[x]).filter(Boolean);
    if (chosen.length) items.push({ title: 'Build your own test', lines: chosen.flatMap((a) => a.lines) });
  }
  const all = items.flatMap((i) => i.lines).join(' ').toLowerCase();
  return {
    reference: m.reference,
    patient: { firstName: m.first_name, lastName: m.last_name, dob: m.dob, sex: m.sex, phone: m.phone, address: m.address, suburb: m.suburb, state: m.state, postcode: m.postcode },
    items, fasting: (PRICES.fasting || []).some((w) => all.includes(w))
  };
}
