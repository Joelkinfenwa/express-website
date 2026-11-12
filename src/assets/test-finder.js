/* Test finder: five questions, then a recommended test plus two alternatives.
   Funnel mode (data-mode="funnel", used by /quiz for paid social): asks for a first name and email
   before the result, shows the quiz offer and links straight to checkout. Answers are never sent to
   ad platforms; only a bare lead event is. */
(function () {
  'use strict';
  var box = document.getElementById('tf'), qEl = document.getElementById('tf-q'), bar = document.getElementById('tf-bar');
  var stepEl = document.getElementById('tf-step'), back = document.getElementById('tf-back'), resEl = document.getElementById('tf-result');
  var dataEl = document.getElementById('tf-data');
  if (!box || !dataEl) return;
  var D = {}; try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var T = D.tests || {}, ADD = D.addons || {}, BASE = D.base || 0;
  var homeFee = box.getAttribute('data-home-fee') || '';
  var FUNNEL = box.getAttribute('data-mode') === 'funnel';
  var HOME_FROM = FUNNEL && D.homeVisit != null ? (D.quizHomeFrom || 0) : 0;
  var lead = null, presetGoal = false;
  if (FUNNEL) window.epQuiz = function () { return { answers: A, lead: lead }; };
  function included(t) { return !!HOME_FROM && !t.builder && !t.homeOnly && t.price >= HOME_FROM; }

  var Q = [
    { id: 'sex', q: 'Who is the test for?', opts: [['male', 'Male'], ['female', 'Female']] },
    { id: 'goal', q: 'What would you most like to understand?', opts: [
      ['general', 'My overall health', 'A check of the core organs, blood and metabolism'],
      ['hormones', 'My hormones', 'Energy, mood, libido or cycle changes'],
      ['performance', 'Training and performance', 'Recovery, body composition and hormones'],
      ['thyroid', 'My thyroid', 'Tiredness, weight change or a family history'],
      ['vitamins', 'Vitamins and iron', 'Low energy, diet or supplement questions'],
      ['sexual', 'Sexual health', 'A discreet STI screen'],
      ['longevity', 'Long-term health and longevity', 'The most detailed picture we offer']] },
    { id: 'age', q: 'What is your age range?', opts: [['u30', 'Under 30'], ['30to44', '30 to 44'], ['45plus', '45 or over']] },
    { id: 'depth', q: 'How thorough would you like it to be?', opts: [
      ['essential', 'Essentials', 'The key markers at the lowest price'],
      ['comprehensive', 'Comprehensive', 'A broader panel, most popular'],
      ['complete', 'As complete as possible', 'Our most detailed options']] },
    { id: 'where', q: 'Where would you like to be tested?', opts: [
      ['centre', 'At a collection centre', '2,000+ partner centres, no extra fee'],
      ['home', 'At home or work', 'A registered nurse comes to you' + (homeFee ? ', ' + homeFee + ' extra' : '')]] }
  ];
  // Funnel mode asks for a budget in place of "how thorough", then fits the recommendation to it
  var CAP = { b150: 150, b300: 300, b450: 450, any: Infinity }, DEPTH = { b150: 'essential', b300: 'comprehensive', b450: 'complete', any: 'complete' };
  if (FUNNEL) Q[3] = { id: 'budget', q: 'What budget suits you?', opts: [
    ['b150', 'Up to $150', 'The essentials for your goal'],
    ['b300', '$150 to $300', 'A broader panel, most popular'],
    ['b450', '$300 to $450', 'Our detailed panels'],
    ['any', 'Show me the most complete option', 'The fullest picture we offer']] };
  // Funnel: open on the question people care about, keep each one short, and say why it is asked
  if (FUNNEL) {
    var byId = {}; Q.forEach(function (q) { byId[q.id] = q; });
    // Asked last: how soon they want the test. It ranks leads and tells Meta which leads are ready to book.
    byId.when = { id: 'when', q: 'When would you like to get tested?', why: 'So we can send you the right next step.', opts: [
      ['asap', 'As soon as possible', 'This week or next'],
      ['weeks', 'In the next few weeks', 'I want to plan it in'],
      ['looking', 'Just looking for now', 'Send me the details']] };
    Q = [byId.goal, byId.sex, byId.age, byId.budget, byId.where, byId.when];
    byId.goal.q = 'What do you want answered?'; byId.goal.why = 'Pick the one that matters most. You can add more later.';
    byId.sex.q = 'Is the test for a man or a woman?'; byId.sex.why = 'Some panels differ between men and women.';
    byId.age.q = 'How old are you?'; byId.age.why = 'The tests worth doing change with age.';
    byId.budget.q = 'What would you like to spend?'; byId.budget.why = 'We fit the recommendation to your budget. Panels start at $99.';
    byId.where.q = 'Where would you like your blood taken?'; byId.where.why = 'You can change this at checkout.';
  }
  var A = {}, step = 0;

  // [primary, alternative, alternative] by goal, sex and depth
  // Picks by goal, sex and depth. 'b:' entries are Build Your Own suggestions (builder test slugs).
  var VIT = 'b:vitamin-d,vitamin-b12,iron-studies', SEX = 'b:hiv,hep-b-antigen,hep-c-antibody', THY = 'b:tsh-t3-and-t4';
  var MAP = {
    general: {
      male: { essential: ['core-health-check', 'essential-mens-panel', 'complete-wellness-panel'], comprehensive: ['essential-mens-panel', 'complete-wellness-panel', 'core-health-check'], complete: ['complete-wellness-panel', 'essential-mens-panel', 'ultimate-performance-screen'] },
      female: { essential: ['core-health-check', 'essential-womens-health-check', 'complete-wellness-panel'], comprehensive: ['essential-womens-health-check', 'complete-wellness-panel', 'core-health-check'], complete: ['complete-wellness-panel', 'essential-womens-health-check', 'ultimate-performance-screen'] } },
    hormones: {
      male: { essential: ['male-hormonal-test', 'ultimate-performance-screen'], comprehensive: ['male-hormonal-test', 'ultimate-performance-screen', 'complete-wellness-panel'], complete: ['ultimate-performance-screen', 'complete-wellness-panel', 'male-hormonal-test'] },
      female: { essential: ['womens-hormonal-package', 'essential-womens-health-check'], comprehensive: ['womens-hormonal-package', 'essential-womens-health-check', 'complete-wellness-panel'], complete: ['complete-wellness-panel', 'womens-hormonal-package', 'ultimate-performance-screen'] } },
    performance: {
      male: { essential: ['male-hormonal-test', 'ultimate-performance-screen'], comprehensive: ['ultimate-performance-screen', 'male-hormonal-test', 'complete-wellness-panel'], complete: ['complete-wellness-panel', 'ultimate-performance-screen'] },
      female: { essential: ['womens-hormonal-package', 'ultimate-performance-screen'], comprehensive: ['ultimate-performance-screen', 'womens-hormonal-package', 'complete-wellness-panel'], complete: ['complete-wellness-panel', 'ultimate-performance-screen'] } },
    thyroid: {
      male: { essential: ['extensive-thyroid-panel', THY], comprehensive: ['extensive-thyroid-panel', 'complete-wellness-panel'], complete: ['extensive-thyroid-panel', 'complete-wellness-panel'] },
      female: { essential: ['extensive-thyroid-panel', THY], comprehensive: ['extensive-thyroid-panel', 'essential-womens-health-check'], complete: ['extensive-thyroid-panel', 'complete-wellness-panel', 'essential-womens-health-check'] } },
    vitamins: {
      male: { essential: [VIT, 'complete-wellness-panel'], comprehensive: [VIT, 'complete-wellness-panel'], complete: ['complete-wellness-panel', VIT] },
      female: { essential: [VIT, 'essential-womens-health-check'], comprehensive: ['essential-womens-health-check', VIT, 'complete-wellness-panel'], complete: ['complete-wellness-panel', 'essential-womens-health-check', VIT] } },
    sexual: { any: { essential: ['sti-screen', SEX], comprehensive: ['sti-screen', SEX], complete: ['sti-screen', SEX] } },
    longevity: { any: { essential: ['complete-wellness-panel', 'ultimate-performance-screen'], comprehensive: ['complete-wellness-panel', 'ultimate-performance-screen'], complete: ['complete-wellness-panel', 'ultimate-performance-screen'] } }
  };
  // Resolve a 'b:' pick into a builder suggestion
  function builderPick(p) {
    var items = p.slice(2).split(',').map(function (s) { return ADD[s] ? { slug: s, t: ADD[s] } : null; }).filter(Boolean);
    if (!items.length) return null;
    var names = items.map(function (x) { return x.t.title; });
    var sum = items.reduce(function (a, x) { return a + x.t.price; }, 0) + BASE;
    return { builder: true, title: 'Build your own: ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0]), price: sum,
      url: '/tests?add=' + items.map(function (x) { return x.slug; }).join(',') + (A.where === 'home' ? '&collect=home' : '') + '#build',
      count: String(items.length), includes: 'Individual tests in one collection, including the $' + BASE + ' build-your-own fee',
      markers: names, slugs: items.map(function (x) { return x.slug; }) };
  }
  function info(h) { return h.indexOf('b:') === 0 ? builderPick(h) : T[h]; }
  var WHY = {
    general: 'A broad baseline of how your body is working, so you know where you stand.',
    hormones: 'The hormones most linked to energy, mood, libido and cycles, measured together so they can be read in context.',
    performance: 'Hormones, metabolism and blood markers that matter most for training, recovery and body composition.',
    thyroid: 'Thyroid hormone levels together with the antibodies that can point to an autoimmune cause.',
    vitamins: 'The nutrients most often low in Australians, to show whether diet or supplements need attention.',
    sexual: 'A private screen for the most common STIs, with no GP visit needed.',
    longevity: 'The most detailed picture of your long-term health, to track year on year.'
  };

  // Single tests to build from, in priority order, when no panel fits the budget (Build Your Own)
  var PRIORITY = {
    general: { any: ['general-biochemistry', 'full-blood-count-and-esr', 'lipid-profile', 'hba1c', 'liver-function', 'kidney-function'] },
    hormones: { male: ['free-and-total-testosterone', 'shbg', 'lh-and-fsh', 'oestradiol-e2', 'prolactin'], female: ['oestradiol-e2', 'progesterone', 'lh-and-fsh', 'prolactin', 'tsh-t3-and-t4'] },
    performance: { any: ['free-and-total-testosterone', 'full-blood-count-and-esr', 'cortisol', 'igf-1', 'fasting-insulin'] },
    thyroid: { any: ['tsh-t3-and-t4', 'tpo-antibodies', 'thyroglobulin-antibodies'] },
    vitamins: { any: ['vitamin-d', 'iron-studies', 'vitamin-b12', 'vitamin-b9-folate'] },
    sexual: { any: [] }, // no single-test build: the STI Screen is the appropriate starting point
    longevity: { any: ['lipid-profile', 'hba1c', 'apo-b', 'crp', 'lp-a', 'fasting-insulin'] }
  };
  // Timed result-page offer: $25 off tests of $200 or more if checkout starts within 15 minutes of the result.
  // The deadline comes signed from the server and is checked again at checkout. Half of visitors see it (group a),
  // so its effect on orders can be compared with the other half (group b).
  var NOW_OFF = 25, NOW_MIN = 200, nowOffer = null, nowGroup = 'a';
  try {
    nowGroup = 'a'; // shown to everyone (the half-and-half comparison was switched off on 12 Nov)
    nowOffer = JSON.parse(localStorage.getItem('ep-now') || 'null');
    if (nowOffer && Date.now() - nowOffer.t > 864e5) nowOffer = null; // one window per day
  } catch (e) {}
  if (/[?&]now=1/.test(location.search)) nowGroup = 'a'; else if (/[?&]now=0/.test(location.search)) nowGroup = 'b';
  // Price shown per day over a year, under the real one-off price. Shown to half of visitors (group a) to measure its effect.
  var pdGroup = 'b';
  try { pdGroup = localStorage.getItem('ep-pd') || (Math.random() < 0.5 ? 'a' : 'b'); localStorage.setItem('ep-pd', pdGroup); } catch (e) {}
  if (/[?&]pd=1/.test(location.search)) pdGroup = 'a'; else if (/[?&]pd=0/.test(location.search)) pdGroup = 'b';
  function perDay(n) { var c = Math.ceil(n / 365 * 100); return c < 100 ? c + ' cents' : '$' + (c / 100).toFixed(2); }
  function nowLive() { return FUNNEL && nowGroup === 'a' && !!nowOffer && nowOffer.until > Date.now(); }
  function nowFits(t) { return !!t && !t.homeOnly && t.price >= NOW_MIN; }
  function nowOff(h) { return nowLive() && nowFits(info(h)) ? NOW_OFF : 0; }
  function nowTake(j) {
    if (nowGroup !== 'a' || nowOffer || !j || !j.x || !j.s) return false;
    nowOffer = { x: j.x, s: j.s, until: Date.now() + (j.ttl || 900) * 1000, t: Date.now() };
    try { localStorage.setItem('ep-now', JSON.stringify(nowOffer)); } catch (e) {}
    return true;
  }
  function nowClock() { var ms = Math.max(0, (nowOffer ? nowOffer.until : 0) - Date.now()), m = Math.floor(ms / 60000), sec = Math.floor(ms / 1000) % 60; return m + ':' + (sec < 10 ? '0' : '') + sec; }
  function homeAdd(t) { return A.where === 'home' && D.homeVisit && !t.homeOnly && !included(t) ? D.homeVisit : 0; }
  function total(h) { var t = info(h); return t ? t.price + homeAdd(t) : Infinity; }
  function custom(cap) {
    var g = PRIORITY[A.goal] || PRIORITY.general, list = g[A.sex] || g.any || [];
    var room = cap - BASE - (A.where === 'home' && D.homeVisit ? D.homeVisit : 0), chosen = [], sum = 0;
    list.forEach(function (s) { if (ADD[s] && sum + ADD[s].price <= room) { chosen.push(s); sum += ADD[s].price; } });
    return chosen.length ? 'b:' + chosen.join(',') : null;
  }
  // [recommended, step up, lower cost]: the fullest option within budget, then one either side of it
  var overBudget = false;
  function funnelPicks() {
    var g = MAP[A.goal] || MAP.general, s = g[A.sex] || g.any || {}, cap = CAP[A.budget] || Infinity, pool = [], seen = {};
    [DEPTH[A.budget] || 'comprehensive', 'essential', 'comprehensive', 'complete'].forEach(function (k) {
      (s[k] || []).forEach(function (h) { if (!seen[h] && info(h)) { seen[h] = 1; pool.push(h); } });
    });
    overBudget = false;
    var primary = pool[0];
    if (cap !== Infinity) {
      // The pool is in relevance order for the goal, so take the first option that fits
      primary = pool.filter(function (h) { return total(h) <= cap; })[0];
      // A panel up to 10% over the budget still leads, labelled as the closest fit, before falling back to a custom build
      if (!primary) { primary = pool.filter(function (h) { return total(h) <= cap * 1.1; })[0]; if (primary) overBudget = true; }
      if (!primary) primary = custom(cap);
      if (!primary) { primary = pool.slice().sort(function (a, b) { return total(a) - total(b); })[0]; overBudget = true; }
    }
    if (!primary) return [];
    var pt = total(primary);
    var up = pool.filter(function (h) { return h !== primary && total(h) > pt; }).sort(function (a, b) { return total(a) - total(b); })[0];
    var down = pool.filter(function (h) { return h !== primary && total(h) < pt; }).sort(function (a, b) { return total(b) - total(a); })[0];
    if (!down && primary.indexOf('b:') !== 0) { var c = custom(Math.min(cap === Infinity ? pt - 1 : cap, pt - 1)); if (c && total(c) < pt) down = c; }
    return [primary, up, down].filter(Boolean);
  }

  function picks() {
    if (FUNNEL) return funnelPicks();
    var g = MAP[A.goal] || MAP.general, s = g[A.sex] || g.any, list = (s && s[A.depth]) || [];
    if (A.goal === 'general' && A.sex === 'male' && A.age === '45plus' && A.depth === 'essential') list = ['essential-mens-panel', 'core-health-check', 'complete-wellness-panel'];
    var seen = {};
    return list.filter(function (h) { if (!info(h) || seen[h]) return false; seen[h] = 1; return true; });
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'html') n.innerHTML = attrs[k]; else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  var stage = document.getElementById('quiz-stage'), intro = document.getElementById('quiz-intro');
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function enter() { if (!FUNNEL || calm) return; qEl.classList.remove('qz-in'); void qEl.offsetWidth; qEl.classList.add('qz-in'); }
  var SIDE = {
    sex: ['heroes/health-check.webp', 'No referral is needed. Your pathology request form is issued with your order.'],
    goal: ['quiz/side-man.webp', 'Panels start at $99, and every test is also available on its own.'],
    age: ['heroes/mens-50s.webp', 'Your results are reviewed by an Australian doctor before your report is sent.'],
    depth: ['quiz/side-food.webp', 'Tell us your budget and we will fit the recommendation to it.'],
    budget: ['quiz/side-food.webp', 'Tell us your budget and we will fit the recommendation to it.'],
    where: ['quiz/centre.webp', 'Walk in to one of 2,000+ partner collection centres, or have a registered nurse come to you.'],
    when: ['heroes/health-check.webp', 'Your pathology request form is issued with your order, so you can go straight to collection.']
  };
  var sideImg = document.getElementById('qz-side-img'), sideFact = document.getElementById('qz-side-fact');
  function side(id) { var x = SIDE[id]; if (!x || !sideImg) return; var src = '/assets/img/' + x[0]; if (sideImg.getAttribute('src') !== src) sideImg.setAttribute('src', src); sideFact.textContent = x[1]; }
  function render() {
    var q = Q[step];
    if (FUNNEL) side(q.id);
    if (FUNNEL && intro) intro.hidden = step > 0;
    if (FUNNEL && stage) stage.classList.remove('is-result');
    bar.style.width = ((step + 1) / Q.length * 100) + '%';
    stepEl.textContent = FUNNEL && step === Q.length - 1 ? 'Last question' : (FUNNEL ? 'Question ' : '') + (step + 1) + ' of ' + Q.length;
    back.hidden = step === 0;
    qEl.innerHTML = '';
    var h = el('h2', { id: 'tf-h', tabindex: '-1', text: q.q, style: "margin: 0; font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; font-size: clamp(24px, 3vw, 32px); letter-spacing: -0.02em" });
    qEl.appendChild(h);
    if (FUNNEL && q.why) qEl.appendChild(el('p', { text: q.why, style: 'margin: -6px 0 6px; font-size: 17px; color: #4B5650' }));
    var list = el('div', { style: 'display: flex; flex-direction: column; gap: 10px', role: 'group', 'aria-labelledby': 'tf-h' });
    q.opts.forEach(function (o) {
      var b = el('button', { type: 'button', class: 'tf-opt', 'aria-pressed': String(A[q.id] === o[0]), onclick: function () { A[q.id] = o[0]; if (FUNNEL && !calm) { b.setAttribute('aria-pressed', 'true'); setTimeout(next, 170); } else next(); } },
        [el('span', {}, [document.createTextNode(o[1]), o[2] ? el('small', { text: o[2] }) : null]), el('span', { 'aria-hidden': 'true', text: '→', style: 'color: #A4502E' })]);
      list.appendChild(b);
    });
    qEl.appendChild(list);
    enter();
  }
  function focusQ() { var h = document.getElementById('tf-h'); if (!h) return; if (FUNNEL) { h.focus({ preventScroll: true }); window.scrollTo(0, 0); } else h.focus(); }
  function next() {
    if (A.goal === 'sexual' && Q[step] && Q[step].id === 'goal') { A.depth = A.depth || 'essential'; }
    step++;
    if (presetGoal && Q[step] && Q[step].id === 'goal') { presetGoal = false; step++; }
    if (A.goal === 'sexual' && Q[step] && Q[step].id === 'depth') step++;
    if (step >= Q.length) return FUNNEL && !lead ? matching(gate) : show();
    render(); focusQ();
  }
  back.addEventListener('click', function () {
    if (step >= Q.length) step = Q.length;
    step--;
    if (A.goal === 'sexual' && Q[step] && Q[step].id === 'depth') step--;
    render(); focusQ();
  });

  function card(h, primary) {
    var t = info(h);
    var priceLine = (t.builder ? '$' : '$') + t.price + (A.where === 'home' && homeFee ? ' + ' + homeFee + ' home visit' : '');
    if (t.homeOnly) priceLine = '$' + t.price + ' including home visit';
    var inc = included(t);
    if (inc && A.where === 'home') priceLine = '$' + t.price + ' with home visit included';
    var direct = FUNNEL && !t.builder && !t.homeOnly;
    var href = t.builder ? t.url : direct ? '/checkout?panel=' + encodeURIComponent(h) + (A.where === 'home' ? '&home=1' : '') + '&offer=quiz' : t.url + (A.where === 'home' ? '?collect=home' : '');
    return el('div', { style: 'display: flex; flex-direction: column; gap: 12px; padding: ' + (primary ? '32px' : '24px') + '; border-radius: 28px; ' + (primary ? 'background: #17302A; color: #F7F4EF' : 'background: #FFFFFF; border: 1px solid #DCE0D8') }, [
      el('span', { text: primary ? 'Our recommendation' : 'Also consider', style: 'font-size: 13px; font-weight: 700; color: ' + (primary ? '#F2A981' : '#A4502E') }),
      el('span', { text: t.title, style: "font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; font-size: " + (primary ? '34px' : '24px') + '; letter-spacing: -0.02em; line-height: 1.1' }),
      inc ? el('span', { text: 'Quiz offer: nurse home visit included' + (homeFee ? ' (normally ' + homeFee + ')' : ''), style: 'align-self: flex-start; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; ' + (primary ? 'background: #F2A981; color: #1C2420' : 'background: #E8EDE6; color: #17302A') }) : null,
      primary ? el('p', { text: (A.goal === 'hormones' && A.sex === 'male' ? 'The hormones most linked to energy, mood, libido and recovery, measured together so they can be read in context.' : WHY[A.goal]) || '', style: 'margin: 0; color: #C5D1CA; font-size: 17px' }) : null,
      el('span', { text: (t.count === '1' ? '1 test' : t.count + ' tests') + ' · ' + t.includes, style: 'color: ' + (primary ? '#C5D1CA' : '#4B5650') + '; font-size: 15px' }),
      el('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; margin-top: 6px' }, [
        el('span', { text: priceLine, style: "font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; font-size: " + (primary ? '30px' : '22px') }),
        el('a', { href: href, class: 'btn', text: t.builder ? 'Build this test' : direct ? (primary ? 'Book this test' : 'Choose this test') : primary ? 'View and order' : 'View test', style: primary ? 'background: #F2A981; color: #1C2420' : 'border: 1px solid #1C2420' })
      ]),
      direct ? el('span', { style: 'font-size: 14px; color: ' + (primary ? '#C5D1CA' : '#5A645E') }, [
        document.createTextNode('Doctor review included. No referral needed. ' + (inc && A.where !== 'home' ? 'Prefer a nurse at home? Choose it at checkout and the visit is included. ' : '')),
        el('a', { href: t.url, text: 'See what is tested', style: 'text-decoration: underline; color: inherit' })
      ]) : null
    ]);
  }

  // ---------- Funnel result: a sales page built from the answers ----------
  var H2 = "margin: 0; font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; letter-spacing: -0.02em; line-height: 1.1";
  function money(n) { return '$' + (Math.round(n * 100) % 100 === 0 ? Math.round(n) : n.toFixed(2)); }
  function href(h) {
    var t = info(h);
    var now = nowOff(h) ? '&offer=now&x=' + nowOffer.x + '&s=' + encodeURIComponent(nowOffer.s) : '';
    if (t.builder) return '/checkout?add=' + t.slugs.join(',') + (A.where === 'home' ? '&home=1' : '') + now;
    if (t.homeOnly) return t.url;
    return '/checkout?panel=' + encodeURIComponent(h) + (A.where === 'home' ? '&home=1' : '') + (now || '&offer=quiz');
  }
  function answerChips() {
    var out = [];
    Q.forEach(function (q) { var o = q.opts.filter(function (x) { return x[0] === A[q.id]; })[0]; if (o) out.push(o[1]); });
    return out;
  }
  function tick(text, dark) {
    return el('li', { style: 'display: flex; gap: 10px; align-items: flex-start' }, [
      el('span', { 'aria-hidden': 'true', text: '✓', style: 'flex: none; font-weight: 700; color: ' + (dark ? '#F2A981' : '#A4502E') }), el('span', { text: text })]);
  }
  // Result page: markers grouped by what they tell you, so a long panel reads at a glance
  var GROUPS = [
    ['Hormones', /testosterone|shbg|sex hormone|luteinis|follicle|lh\b|fsh|oestradiol|prolactin|progesterone|dhea|igf|growth hormone|cortisol|amh|psa/i],
    ['Thyroid', /tsh|\bt3\b|\bt4\b|thyro|tpo/i],
    ['Heart and metabolism', /lipid|cholesterol|hdl|ldl|hba1c|insulin|glucose|apo ?b|lp\(a\)|crp|triglyc/i],
    ['Blood, iron and vitamins', /blood count|fbc|esr|iron|ferritin|vitamin|b12|folate/i],
    ['Liver, kidneys and general health', /biochem|liver|kidney|electrolyte|urea|mba/i]
  ];
  function grouped(markers) {
    var out = GROUPS.map(function (g) { return { name: g[0], items: [] }; }), other = { name: 'Also included', items: [] };
    (markers || []).forEach(function (m) {
      for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][1].test(m)) { out[i].items.push(m); return; }
      other.items.push(m);
    });
    return out.concat([other]).filter(function (g) { return g.items.length; });
  }
  function mainCard(h) {
    var t = info(h), inc = included(t), home = A.where === 'home', tot = total(h), cap = CAP[A.budget] || Infinity;
    var n = (t.markers || []).length || Number(t.count);
    var badge = overBudget ? 'Closest to your budget' : cap !== Infinity ? 'Fits your budget' : 'Our most complete option';
    var why = (A.goal === 'hormones' && A.sex === 'male' ? 'The hormones most linked to energy, mood, libido and recovery, measured together so they can be read in context.' : WHY[A.goal]) || '';
    var save = t.single && t.single > t.price ? t.single - t.price : 0;
    // Lead line: the real number of tests in this option, tied to what the person asked about
    var LEAD = { general: 'covering your core organs, blood and metabolism', hormones: A.sex === 'male' ? 'linked to energy, mood, libido and recovery' : 'linked to energy, mood, libido and cycles',
      performance: 'linked to training, recovery and body composition', thyroid: 'covering thyroid hormones and thyroid antibodies', vitamins: 'for the nutrients most often low in Australians',
      sexual: 'for the most common STIs', longevity: 'for a detailed picture of your long-term health' };
    var lead = n && LEAD[A.goal] ? LEAD[A.goal] + '.' : '';
    var assure = [
      'No referral or GP visit. Your request form is issued with your order',
      'Reviewed by an Australian doctor, emailed with reference ranges',
      home ? (inc ? 'A registered nurse comes to you, included' + (homeFee ? ' (normally ' + homeFee + ')' : '') : 'A registered nurse comes to your home or workplace' + (homeAdd(t) ? ' (' + money(homeAdd(t)) + ')' : ''))
           : 'Walk in to any of 2,000+ partner collection centres' + (inc ? ', or a nurse at home included at checkout' : ''),
      'Full refund if we cannot arrange your collection'
    ];
    var groups = grouped(t.markers);
    return el('div', { id: 'tf-main', class: 'rs-hero' }, [
      el('div', { class: 'rs-buy' }, [
        el('div', { style: 'display: flex; flex-wrap: wrap; gap: 8px' }, [
          el('span', { class: 'rs-pill is-peach', text: 'Your match' }),
          el('span', { class: 'rs-pill', text: badge }),
          inc ? el('span', { class: 'rs-pill', text: 'Nurse home visit included' }) : null
        ]),
        el('h3', { text: t.title, class: 'rs-title' }),
        lead ? el('p', { style: 'margin: 0; display: flex; flex-direction: column; gap: 2px' }, [
          el('strong', { text: n + (n === 1 ? ' test' : ' tests'), style: "font-family: var(--display, 'Instrument Sans', sans-serif); font-size: clamp(38px, 5vw, 46px); font-weight: 700; letter-spacing: -.03em; line-height: 1.05; color: #F2A981" }),
          el('span', { text: lead, style: 'color: #F7F4EF; font-size: 19px; font-weight: 500; line-height: 1.35' })]) : el('p', { text: why, style: 'margin: 0; color: #C5D1CA; font-size: 17px' }),
        el('div', { class: 'rs-price' }, [
          el('strong', { text: money(tot) }),
          save ? el('s', { text: money(t.single + (tot - t.price)), 'aria-label': 'Usually ' + money(t.single + (tot - t.price)) + ' as single tests', style: 'font-size: 24px; color: #9DB0A6; text-decoration-thickness: 2px' }) : null,
          el('span', { text: (lead ? 'One blood collection' : n ? n + (n === 1 ? ' test' : ' tests') + ' from one collection' : '') + (home && !inc && homeAdd(t) ? ', including ' + money(homeAdd(t)) + ' home visit' : '') , style: save ? 'flex: 1 1 100%' : '' })
        ]),
        FUNNEL && pdGroup === 'a' ? el('p', { class: 'rs-perday', style: 'margin: 0; font-size: 17px; color: #F7F4EF' }, [
          document.createTextNode('That is '), el('strong', { text: perDay(tot) + ' a day', style: 'color: #F2A981' }), document.createTextNode(' over a year. You pay once, ' + money(tot) + '.')]) : null,
        save ? el('span', { class: 'rs-save', text: 'Save ' + money(save), style: 'font-size: 16px; padding: 7px 14px; border-radius: 999px' }) : null,
        nowOff(h) ? el('div', { class: 'rs-now', role: 'timer', style: 'display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-radius: 14px; background: #F7F4EF; color: #1C2420' }, [
          el('strong', { style: 'font-size: 18px; line-height: 1.25' }, [document.createTextNode('Book in the next '), el('span', { class: 'rs-now-t', text: nowClock(), style: 'font-variant-numeric: tabular-nums; color: #A4502E' }), document.createTextNode(' and we take ' + money(NOW_OFF) + ' off.')]),
          el('span', { text: 'You pay ' + money(tot - NOW_OFF) + ' instead of ' + money(tot) + '.', style: 'font-size: 15px; color: #4B5650' })]) : null,
        el('a', { href: href(h), class: 'rs-cta', id: 'tf-cta' }, [document.createTextNode(nowOff(h) ? 'Book now for ' + money(tot - NOW_OFF) : 'Book this test'), el('span', { 'aria-hidden': 'true', text: '→' })]),
        el('span', { text: 'One payment. Secure checkout by Stripe.', style: 'font-size: 14px; color: #C5D1CA; text-align: center' }),
        el('ul', { class: 'rs-assure' }, assure.map(function (g) { return tick(g, true); }))
      ]),
      el('div', { class: 'rs-in' }, [
        el('strong', { text: 'What this test checks', class: 'rs-in-h' }),
        el('div', {}, groups.map(function (g) {
          return el('div', { class: 'rs-group' }, [
            el('span', { class: 'rs-ico', 'aria-hidden': 'true', text: String(g.items.length) }),
            el('div', {}, [el('strong', { text: g.name }), el('span', { text: g.items.join(', ') })])
          ]);
        }))
      ])
    ]);
  }
  function fitCards(t) {
    var goal = (Q.filter(function (q) { return q.id === 'goal'; })[0].opts.filter(function (o) { return o[0] === A.goal; })[0] || [])[1] || 'Your goal';
    var cap = CAP[A.budget] || Infinity, tot = total(picks()[0]);
    var cards = [
      ['Your goal', goal, 'This panel was chosen for what you told us you want answered.'],
      ['Your budget', overBudget ? 'Closest we can get' : cap !== Infinity ? 'Within ' + money(cap) : 'The most complete', overBudget ? 'At ' + money(tot) + ', this is the nearest panel to your budget. Lower cost options are below.' : cap !== Infinity ? 'At ' + money(tot) + ', it sits inside the budget you set.' : 'You asked for the fullest picture we offer.'],
      ['Your collection', A.where === 'home' ? 'At home or work' : 'At a collection centre', A.where === 'home' ? 'A registered nurse comes to you. You choose the time at checkout.' : 'Walk in to any of 2,000+ partner centres. You can switch to a nurse visit at checkout.']
    ];
    return el('div', { class: 'rs-3' }, cards.map(function (c) { return el('div', { class: 'rs-card' }, [el('span', { text: c[0] }), el('strong', { text: c[1] }), el('p', { text: c[2] })]); }));
  }
  function nextSteps() {
    var steps = [
      ['Pay online', 'Your pathology request form arrives by email. No referral and no GP visit.'],
      [A.where === 'home' ? 'A nurse comes to you' : 'Walk in to a collection centre', A.where === 'home' ? 'A registered nurse collects at your home or workplace, at a time you choose.' : 'Take your form to any of our 2,000+ partner collection centres.'],
      ['Get your results by email', 'Reviewed by an Australian doctor, with every result shown against its reference range.']
    ];
    return el('ol', { class: 'rs-steps' }, steps.map(function (x, i) { return el('li', {}, [el('b', { text: String(i + 1) }), el('strong', { text: x[0] }), el('span', { text: x[1] })]); }));
  }
  // Postcode check for nurse home visits, from the same coverage list the checkout uses
  function areaCheck() {
    var out = el('p', { 'aria-live': 'polite', style: 'margin: 0; font-size: 16px; font-weight: 600; min-height: 24px' });
    var input = el('input', { id: 'rs-pc', type: 'text', inputmode: 'numeric', maxlength: '4', autocomplete: 'postal-code', placeholder: 'Postcode', style: 'width: 130px; min-height: 48px; padding: 0 14px; border-radius: 12px; border: 1px solid #B9C2BA; font: inherit; background: #FFFFFF' });
    var cov = null, asked = false;
    function show() {
      var pc = input.value.replace(/\D/g, '');
      if (pc.length !== 4 || !cov) { out.textContent = ''; return; }
      var ok = cov.metro.indexOf(pc) !== -1 || cov.regional.indexOf(pc) !== -1;
      out.textContent = ok ? 'Yes. A registered nurse can come to you in ' + pc + (homeFee ? ' for ' + homeFee : '') + ', or you can walk in to a partner collection centre.'
        : 'You can walk in to a partner collection centre. For a nurse visit in ' + pc + ', our team confirms availability after booking, with a full refund if we cannot arrange it.';
      if (window.epTrack) window.epTrack('quiz_area_check', { covered: ok ? 'yes' : 'no' });
    }
    input.addEventListener('input', function () {
      if (!asked) { asked = true; fetch('/assets/coverage.json').then(function (r) { return r.json(); }).then(function (j) { cov = j; show(); }).catch(function () {}); }
      show();
    });
    return el('div', { style: 'display: flex; flex-direction: column; gap: 10px; padding: 22px; border-radius: 20px; background: #FFFFFF; border: 1px solid #DCE0D8' }, [
      el('label', { for: 'rs-pc', text: 'Can a nurse come to me?', style: H2 + '; font-size: 22px' }),
      el('span', { text: 'Enter your postcode to check. You can always walk in to a partner collection centre instead.', style: 'font-size: 15px; color: #4B5650' }),
      input, out
    ]);
  }
  function quickAnswers() {
    var qa = [
      ['Do I need a referral?', 'No. We issue your pathology request form with your order.'],
      ['Where do I go?', 'Any of our 2,000+ partner collection centres. Or a registered nurse can come to your home or workplace' + (homeFee ? ' for ' + homeFee : '') + '.'],
      ['Do I need to fast?', 'Some tests need an 8 to 12 hour fast, with water only. Your confirmation email tells you exactly what applies to your test.'],
      ['What do I receive?', 'A report by email, reviewed by an Australian doctor, with each result shown against its reference range. You can forward it to your GP.'],
      ['Is it covered by Medicare?', 'No. The price shown is the full price, with doctor review included.'],
      ['What if my collection cannot be arranged?', 'You receive a full refund.']
    ];
    return el('dl', { style: 'margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px' }, qa.map(function (x) {
      return el('div', { style: 'display: flex; flex-direction: column; gap: 4px; padding: 18px 20px; border-radius: 16px; background: #E8EDE6' }, [
        el('dt', { text: x[0], style: 'font-weight: 700; font-size: 17px' }), el('dd', { text: x[1], style: 'margin: 0; font-size: 15px; color: #33403A' })]);
    }));
  }
  function sampleReport() {
    var rows = [['Testosterone', '18.4', 'nmol/L', 25, 75, 52], ['TSH', '2.1', 'mIU/L', 20, 70, 40], ['HbA1c', '5.2', '%', 15, 60, 42], ['LDL cholesterol', '3.9', 'mmol/L', 10, 62, 74, 1]];
    return el('div', { class: 'rs-report' }, [
      el('div', { style: 'display: flex; flex-direction: column; gap: 12px; align-items: flex-start' }, [
        el('h3', { text: 'Your numbers, made clear', style: H2 + '; font-size: clamp(26px, 3.4vw, 36px)' }),
        el('p', { text: 'Every result is shown against its reference range, so you can see at a glance what is in range and what is worth raising with your doctor.', style: 'margin: 0; color: #4B5650; font-size: 17px' }),
        el('a', { href: href(picks()[0]), class: 'btn btn-dark', text: 'Book this test', style: 'min-height: 52px; padding: 0 26px' })
      ]),
      el('div', {}, [
        el('div', { class: 'lp-report', role: 'img', 'aria-label': 'A sample report with four results, each shown on a reference range bar' }, [
          el('header', {}, [el('strong', { text: 'Your results' }), el('span', { text: 'Reviewed by a doctor' })])
        ].concat(rows.map(function (r) {
          return el('div', { class: 'lp-row' }, [
            el('div', {}, [el('span', {}, [document.createTextNode(r[0]), r[6] ? el('em', { text: 'Above range' }) : null]), el('span', {}, [document.createTextNode(r[1] + ' '), el('small', { text: r[2] })])]),
            el('div', { class: 'lp-bar' }, [el('i', { style: 'left: ' + r[3] + '%; width: ' + (r[4] - r[3]) + '%' }), el('b', { class: r[6] ? 'hi' : '', style: 'left: ' + r[5] + '%' })])
          ]);
        }))),
        el('p', { class: 'lp-fine', text: 'Sample report with illustrative values. Results are for information and are not a medical diagnosis.', style: 'margin-top: 10px' })
      ])
    ]);
  }
  function altCard(h, main) {
    var t = info(h), m = info(main), d = total(h) - total(main), extra = (t.markers || []).filter(function (x) { return (m.markers || []).indexOf(x) === -1; });
    var line = d > 0 && extra.length ? 'Adds ' + extra.slice(0, 4).join(', ') + (extra.length > 4 ? ' and ' + (extra.length - 4) + ' more' : '') + '.'
      : (t.markers || []).slice(0, 5).join(', ') + ((t.markers || []).length > 5 ? ' and ' + ((t.markers || []).length - 5) + ' more' : '') + '.';
    return el('div', { style: 'display: flex; flex-direction: column; gap: 10px; padding: 24px; border-radius: 24px; background: #FFFFFF; border: 1px solid #DCE0D8' }, [
      el('span', { text: d > 0 ? (total(h) <= (CAP[A.budget] || Infinity) && CAP[A.budget] !== Infinity ? 'Also within your budget, ' + money(d) + ' more' : 'Step up for ' + money(d) + ' more') : 'Lower cost option, ' + money(-d) + ' less', style: 'font-size: 13px; font-weight: 700; color: #A4502E' }),
      el('span', { text: t.title, style: H2 + '; font-size: 22px' }),
      el('span', { text: line, style: 'color: #4B5650; font-size: 15px' }),
      included(t) ? el('span', { text: 'Nurse home visit included', style: 'align-self: flex-start; padding: 5px 11px; border-radius: 999px; font-size: 13px; font-weight: 700; background: #E8EDE6; color: #17302A' }) : null,
      el('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-top: auto' }, [
        el('span', { text: money(total(h)), style: "font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; font-size: 24px" }),
        el('a', { href: href(h), class: 'btn', text: 'Choose this test', style: 'border: 1px solid #1C2420' })])
    ]);
  }
  function showFunnel(p) {
    var first = lead && lead.name ? lead.name.split(' ')[0] : '';
    resEl.appendChild(el('h2', { id: 'tf-res-h', tabindex: '-1', text: (first ? first + ', we' : 'We') + ' found your test', style: H2 + '; font-size: clamp(28px, 3.4vw, 40px)' }));
    resEl.appendChild(mainCard(p[0]));
    resEl.appendChild(el('h3', { text: 'How it works', style: H2 + '; font-size: 24px; margin-top: 12px' }));
    resEl.appendChild(nextSteps());
    resEl.appendChild(areaCheck());
    resEl.appendChild(el('h3', { text: 'Quick answers', style: H2 + '; font-size: 24px; margin-top: 12px' }));
    resEl.appendChild(quickAnswers());
    resEl.appendChild(el('a', { href: href(p[0]), class: 'btn btn-dark', text: nowOff(p[0]) ? 'Book now for ' + money(total(p[0]) - NOW_OFF) : 'Book this test, ' + money(total(p[0])), style: 'align-self: flex-start; min-height: 56px; padding: 0 30px; font-size: 18px' }));
    resEl.appendChild(sampleReport());
    resEl.appendChild(el('h3', { text: 'Why this fits you', style: H2 + '; font-size: 24px; margin-top: 12px' }));
    resEl.appendChild(fitCards(info(p[0])));
    var ups = p.slice(1).filter(function (h) { return total(h) > total(p[0]); }), downs = p.slice(1).filter(function (h) { return total(h) <= total(p[0]); });
    if (ups.length) {
      resEl.appendChild(el('h3', { text: 'Want a fuller picture?', style: H2 + '; font-size: 24px; margin-top: 12px' }));
      var alts = el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px' });
      ups.forEach(function (h) { alts.appendChild(altCard(h, p[0])); });
      resEl.appendChild(alts);
    }
    downs.forEach(function (h) {
      resEl.appendChild(el('p', { style: 'margin: 0; font-size: 15px; color: #4B5650' }, [
        document.createTextNode('Prefer to spend less? '),
        el('a', { href: href(h), text: info(h).title + ', ' + money(total(h)), style: 'font-weight: 600; text-decoration: underline' }), document.createTextNode('.')]));
    });
    var g = PRIORITY[A.goal] || PRIORITY.general, own = (g[A.sex] || g.any || []).filter(function (s) { return ADD[s]; });
    resEl.appendChild(el('p', { style: 'margin: 0; padding: 20px 24px; border-radius: 22px; background: #E8EDE6; font-size: 16px' }, [
      el('strong', { text: 'We can make a test work for any budget. ' }),
      document.createTextNode('Every test is also available on its own, from ' + money(Math.min.apply(null, Object.keys(ADD).map(function (k) { return ADD[k].price; }))) + ' each plus a ' + money(BASE) + ' fee. '),
      el('a', { href: '/tests?add=' + own.slice(0, 2).join(',') + (A.where === 'home' ? '&collect=home' : '') + '#build', text: 'Build your own', style: 'font-weight: 700; text-decoration: underline' }), document.createTextNode('.')]));
    resEl.appendChild(el('p', { style: 'margin: 0; font-size: 14px; color: #5A645E' }, [
      document.createTextNode((lead && lead.sent && A.when === 'asap' ? 'We are emailing you a copy now. ' : '') + 'Knowing your numbers gives you and your doctor a baseline to work from. '),
      HOME_FROM ? el('a', { href: '#offer-terms', text: 'Quiz offer terms', style: 'text-decoration: underline' }) : null, document.createTextNode(HOME_FROM ? ' apply.' : '')]));
    resEl.appendChild(el('div', { style: 'display: flex; flex-direction: column; gap: 10px; padding-top: 8px; border-top: 1px solid #DCE0D8' }, [
      el('span', { text: 'Your answers', style: 'font-size: 13px; font-weight: 700; color: #5A645E' }),
      el('ul', { 'aria-label': 'Your answers', style: 'margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px' }, answerChips().map(function (c) {
        return el('li', { text: c, style: 'padding: 5px 11px; border-radius: 999px; background: #E8EDE6; font-size: 14px; font-weight: 600' }); })),
      el('button', { type: 'button', class: 'tf-link', text: 'Start again', style: 'align-self: flex-start', onclick: function () { A = {}; step = 0; resEl.hidden = true; box.hidden = false; var b = document.getElementById('tf-sticky'); if (b) b.remove(); var intro = document.getElementById('quiz-intro'); if (intro) intro.hidden = false; render(); focusQ(); } })
    ]));
    // Order bar that stays in view once the main button has scrolled away
    var t = info(p[0]), cta = document.getElementById('tf-cta');
    var barEl = el('div', { id: 'tf-sticky', hidden: '', style: 'position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; background: #FFFFFF; border-top: 1px solid #DCE0D8; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); display: flex; justify-content: center' }, [
      el('div', { style: 'width: 100%; max-width: 832px; display: flex; align-items: center; justify-content: space-between; gap: 12px' }, [
        el('span', { style: 'display: flex; flex-direction: column; min-width: 0' }, [
          el('strong', { text: t.title, style: 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis' }),
          el('span', { style: 'font-size: 14px; color: #4B5650' }, nowOff(p[0]) ? [document.createTextNode(money(total(p[0]) - NOW_OFF) + ' for the next '), el('span', { class: 'rs-now-t', text: nowClock(), style: 'font-variant-numeric: tabular-nums; font-weight: 700; color: #A4502E' })] : [document.createTextNode(money(total(p[0])) + (included(t) && A.where === 'home' ? ' with home visit included' : ''))])]),
        el('a', { href: href(p[0]), class: 'btn btn-dark', text: 'Book this test', style: 'flex: none' })])]);
    document.body.appendChild(barEl);
    if (cta && 'IntersectionObserver' in window) new IntersectionObserver(function (es) { barEl.hidden = es[0].isIntersecting || resEl.hidden; }).observe(cta);
    if (window.epStep && !showFunnel.sent) { showFunnel.sent = true; window.epStep('4 Result viewed', { offer: nowOff(p[0]) ? 'yes' : 'no', perday: pdGroup === 'a' ? 'shown' : 'not shown' }); }
    if (!showFunnel.bound) {
      showFunnel.bound = true;
      document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href^="/checkout"]') : null;
        if (a && window.epStep && (resEl.contains(a) || a.closest('#tf-sticky'))) window.epStep('5 Book button tapped', { offer: /offer=now/.test(a.getAttribute('href')) ? 'yes' : 'no', perday: pdGroup === 'a' ? 'shown' : 'not shown' });
      });
    }
    // Countdown for the timed offer. When it ends the page is redrawn at the standard price.
    clearInterval(nowTick);
    if (nowOff(p[0])) {
      if (window.epTrack) window.epTrack('quiz_now_offer_shown', {});
      nowTick = setInterval(function () {
        if (resEl.hidden) return;
        if (!nowLive()) { clearInterval(nowTick); reshow(); return; }
        Array.prototype.forEach.call(document.querySelectorAll('.rs-now-t'), function (n) { n.textContent = nowClock(); });
      }, 1000);
    }
  }
  var nowTick = 0;
  function reshow() { var b = document.getElementById('tf-sticky'); if (b) b.remove(); show(); }

  // Funnel mode: a short beat while the recommendation is put together
  function matching(then) {
    step = Q.length;
    if (calm) return then();
    if (intro) intro.hidden = true;
    bar.style.width = '100%'; stepEl.textContent = 'Almost there'; back.hidden = true;
    qEl.innerHTML = '';
    var lines = ['Matching your goals to our panels', 'Fitting it to your budget', 'Checking collection options'];
    var items = lines.map(function (t) { return el('li', { class: 'qz-step', text: t }); });
    qEl.appendChild(el('h2', { id: 'tf-h', tabindex: '-1', text: 'Building your recommendation', style: "margin: 0; font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; font-size: clamp(28px, 5vw, 44px); letter-spacing: -0.03em; line-height: 1.05" }));
    qEl.appendChild(el('ul', { style: 'margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px; font-size: 18px' }, items));
    enter();
    items.forEach(function (li, i) { setTimeout(function () { li.classList.add('is-done'); }, 350 + i * 420); });
    setTimeout(then, 350 + lines.length * 420 + 250);
  }

  // Funnel mode: first name and email before the result
  // Follow-up emails: record the quiz completion in Klaviyo from the browser (public client API, no secret)
  function klaviyoClient(kl, who) {
    var H = { 'Content-Type': 'application/json', revision: '2024-10-15' }, base = 'https://a.klaviyo.com/client/', q = '/?company_id=' + encodeURIComponent(kl.company);
    var prof = { data: { type: 'profile', attributes: { email: who.email, first_name: (who.name || '').split(' ')[0] } } };
    fetch(base + 'events' + q, { method: 'POST', headers: H, body: JSON.stringify({ data: { type: 'event', attributes: { properties: kl.properties, metric: { data: { type: 'metric', attributes: { name: kl.event } } }, profile: prof } } }) }).catch(function () {});
    if (kl.list) fetch(base + 'subscriptions' + q, { method: 'POST', headers: H, body: JSON.stringify({ data: { type: 'subscription', attributes: { custom_source: 'Test finder quiz', profile: { data: { type: 'profile', attributes: { email: who.email, subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } } } } } }, relationships: { list: { data: { type: 'list', id: kl.list } } } } }) }).catch(function () {});
  }

  function teaser(p) {
    var t = p[0] ? info(p[0]) : null; if (!t) return null;
    var n = (t.markers || []).length, bits = [];
    if (n) bits.push(n + (n === 1 ? ' test' : ' tests'));
    bits.push('Matched to your goal and budget');
    if (p.length > 1) bits.push((p.length - 1) + ' alternative' + (p.length > 2 ? 's' : ''));
    return el('div', { class: 'qz-teaser' }, [
      el('span', { class: 'qz-lock', 'aria-hidden': 'true', text: '✓' }),
      el('div', {}, [el('strong', { class: 'qz-blur', 'aria-hidden': 'true', text: t.title }), el('span', { text: bits.join(' · ') })])
    ]);
  }
  function gate() {
    if (window.epStep && !gate.sent) { gate.sent = true; window.epStep('2 Quiz answered, email step shown'); }
    step = Q.length;
    bar.style.width = '100%'; stepEl.textContent = 'Done'; back.hidden = false;
    qEl.innerHTML = '';
    var p = picks();
    var inp = 'min-height: 54px; border: 1px solid #D3D8D0; border-radius: 14px; padding: 0 14px; font: inherit; background: #FFFFFF; color: #1C2420; width: 100%';
    var status = el('p', { class: 'form-status', role: 'status', 'aria-live': 'polite', style: 'margin: 0' });
    var form = el('form', { novalidate: '', style: 'display: flex; flex-direction: column; gap: 14px' }, [
      el('h2', { id: 'tf-h', tabindex: '-1', text: 'We found your match.', style: "margin: 0; font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; font-size: clamp(24px, 3vw, 32px); letter-spacing: -0.02em" }),
      teaser(p),
      el('p', { text: 'Where should we send it?', style: 'margin: 4px 0 0; color: #4B5650; font-size: 17px' }),
      el('label', { for: 'tf-email', class: 'sr-only', text: 'Email' }), el('input', { id: 'tf-email', name: 'email', type: 'email', required: '', autocomplete: 'email', inputmode: 'email', placeholder: 'Email', style: inp }),
      el('input', { name: 'company_website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', style: 'position: absolute; left: -9999px; width: 1px; height: 1px' }),
      el('button', { type: 'submit', class: 'btn btn-dark', text: 'Show my match', style: 'min-height: 56px; font-size: 17px' }),
      status,
      el('p', { style: 'margin: 0; font-size: 13px; color: #5A645E' }, [
        document.createTextNode('We will email your recommendation and occasional offers from Express Pathology. You can unsubscribe at any time. See our '),
        el('a', { href: '/privacy-policy', text: 'privacy policy', style: 'text-decoration: underline' }), document.createTextNode('.')
      ])
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'One moment…';
      lead = { name: '', email: form.email.value.trim() }; // email only: one field converts better than two
      var done = false, go = function () { if (done) return; done = true; show(); };
      setTimeout(go, 4000); // never hold the result back if the request is slow
      fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        kind: 'quiz', offer: 'quiz', page: location.pathname, name: lead.name, email: lead.email, company_website: form.company_website.value,
        collection: A.where === 'home' ? 'home' : 'centre',
        timing: A.when || '',
        tests: p[0] && p[0].indexOf('b:') === 0 ? p[0].slice(2) : '',
        topic: 'Quiz funnel' + (A.when === 'asap' ? ' (READY NOW)' : A.when === 'weeks' ? ' (next few weeks)' : A.when === 'looking' ? ' (just looking)' : '') + ': ' + (p[0] ? info(p[0]).title : 'no match'),
        message: 'Recommended: ' + p.map(function (h) { return info(h).title; }).join(', ') + '\nAnswers: ' + JSON.stringify(A) + '\nCame from: ' + (window.epSrc ? window.epSrc() : '') + '\nPer-day price line: ' + (pdGroup === 'a' ? 'shown' : 'not shown'),
        recommendation: p.filter(function (h) { return h.indexOf('b:') !== 0; }).join(',')
      }) }).then(function (r) {
        if (!r.ok) throw new Error();
        // Lead events carry no answers or test names
        lead.sent = true;
        try { localStorage.setItem('ep-lead-email', lead.email); if (lead.name) localStorage.setItem('ep-lead-name', lead.name.split(' ')[0]); } catch (e) {}
        if (window.epTrack) window.epTrack('test_finder_lead', {});
        if (window.fbq) window.fbq('track', 'Lead');
        if (window.epStep) window.epStep('3 Email given (lead)', { when: A.when || 'not asked' });
        // A separate Meta event for leads who want to be tested as soon as possible, so a campaign can optimise for them
        if (A.when === 'asap') { if (window.fbq) window.fbq('trackCustom', 'ReadyToBookLead'); if (window.epStep) window.epStep('3b Lead wants testing as soon as possible'); }
        return r.json().then(function (j) {
          if (j && j.kl) klaviyoClient(j.kl, lead);
          if (j && nowTake(j.now) && done) reshow(); // the result was already on screen: redraw it with the offer
        }).catch(function () {});
      }).catch(function () {}).then(go);
    });
    qEl.appendChild(form);
    enter();
    focusQ();
  }

  function show() {
    var p = picks();
    box.hidden = true; resEl.hidden = false; resEl.innerHTML = '';
    if (FUNNEL && p.length) {
      if (stage) stage.classList.add('is-result');
      document.body.classList.remove('qz-running');
      showFunnel(p);
      var top = document.getElementById('quiz-intro'); if (top) top.hidden = true;
      window.scrollTo(0, 0);
      var hf = document.getElementById('tf-res-h'); if (hf) hf.focus({ preventScroll: true });
      if (window.gtag) window.gtag('event', 'test_finder_complete', {});
      return;
    }
    var head = el('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 12px' }, [
      el('h2', { id: 'tf-res-h', tabindex: '-1', text: lead && lead.name ? lead.name.split(' ')[0] + ', here is your recommended test' : 'Your recommended test', style: "margin: 0; font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; font-size: clamp(28px, 3.4vw, 40px); letter-spacing: -0.03em" }),
      el('button', { type: 'button', class: 'tf-link', text: 'Start again', onclick: function () { A = {}; step = 0; resEl.hidden = true; box.hidden = false; render(); focusQ(); } })
    ]);
    resEl.appendChild(head);
    if (!p.length) { resEl.appendChild(el('p', { html: 'Browse <a href="/tests" style="text-decoration: underline">all tests</a> to find the right one.' })); return; }
    resEl.appendChild(card(p[0], true));
    var alts = el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px' });
    p.slice(1, 3).forEach(function (h) { alts.appendChild(card(h, false)); });
    resEl.appendChild(alts);

    // Optional: email the recommendation
    var status = el('p', { class: 'form-status', role: 'status', 'aria-live': 'polite', style: 'margin: 0' });
    var form = el('form', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; padding: 24px; border-radius: 24px; background: #E8EDE6' }, [
      el('span', { text: 'Want this saved? We will email you your recommendation.', style: 'grid-column: 1 / -1; font-weight: 700' }),
      el('label', { for: 'tf-name', class: 'sr-only', text: 'First name' }), el('input', { id: 'tf-name', name: 'name', required: '', autocomplete: 'given-name', placeholder: 'First name', style: 'min-height: 50px; border: 1px solid #D3D8D0; border-radius: 14px; padding: 0 14px; font: inherit; background: #FFFFFF' }),
      el('label', { for: 'tf-email', class: 'sr-only', text: 'Email' }), el('input', { id: 'tf-email', name: 'email', type: 'email', required: '', autocomplete: 'email', placeholder: 'Email', style: 'min-height: 50px; border: 1px solid #D3D8D0; border-radius: 14px; padding: 0 14px; font: inherit; background: #FFFFFF' }),
      el('button', { type: 'submit', class: 'btn btn-dark', text: 'Email me', style: 'min-height: 50px; border: 0; cursor: pointer; font: inherit; font-weight: 700' }),
      status
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (!form.reportValidity()) return;
      var btn = form.querySelector('button'); btn.disabled = true; status.textContent = 'Sending…';
      fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        kind: 'quiz', page: location.pathname, name: form.name.value, email: form.email.value,
        topic: 'Test finder: ' + info(p[0]).title,
        message: 'Recommended: ' + p.map(function (h) { return info(h).title; }).join(', ') + '\nAnswers: ' + JSON.stringify(A) + '\nCame from: ' + (window.epSrc ? window.epSrc() : ''),
        recommendation: p.filter(function (h) { return h.indexOf('b:') !== 0; }).join(',')
      }) }).then(function (r) { if (!r.ok) throw new Error(); status.setAttribute('data-state', 'ok'); status.textContent = 'Sent. Check your inbox shortly.'; form.reset(); if (window.epTrack) window.epTrack('test_finder_lead', { recommendation: p[0] }); })
        .catch(function () { status.setAttribute('data-state', 'error'); status.textContent = 'That did not send. Please try again.'; btn.disabled = false; });
    });
    if (!FUNNEL) resEl.appendChild(form);
    else if (HOME_FROM) resEl.appendChild(el('p', { style: 'margin: 0; font-size: 14px; color: #5A645E' }, [document.createTextNode(lead && lead.sent ? 'We have emailed you a copy. ' : ''), el('a', { href: '#offer-terms', text: 'Quiz offer terms', style: 'text-decoration: underline' }), document.createTextNode(' apply.')]));
    var h2 = document.getElementById('tf-res-h'); if (h2) h2.focus();
    if (FUNNEL) { var top = document.getElementById('quiz-intro'); if (top) top.hidden = true; window.scrollTo(0, 0); }
    if (window.gtag) window.gtag('event', 'test_finder_complete', { goal: A.goal, recommendation: p[0] });
  }

  // Funnel: a landing screen first; the quiz starts from any "Start the quiz" control (?start=1 skips it)
  var landing = document.getElementById('quiz-landing'), stickyStart = document.getElementById('quiz-sticky');
  function startQuiz(e) {
    if (window.epStep && !startQuiz.sent) { startQuiz.sent = true; window.epStep('1 Quiz started'); }
    var g = e && e.currentTarget && e.currentTarget.getAttribute && e.currentTarget.getAttribute('data-goal');
    if (g) { A.goal = g; presetGoal = true; if (Q[0].id === 'goal') { step = 1; presetGoal = false; } }
    if (landing) landing.hidden = true;
    if (stickyStart) stickyStart.hidden = true;
    if (stage) stage.classList.remove('is-landing');
    document.body.classList.add('qz-running');
    render(); focusQ();
    if (window.gtag) window.gtag('event', 'quiz_start', {});
  }
  if (FUNNEL && landing && !/[?&]start=1\b/.test(location.search)) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-quiz-start]'), function (b) { b.addEventListener('click', startQuiz); });
    var first = document.getElementById('quiz-start');
    if (first && stickyStart && 'IntersectionObserver' in window) new IntersectionObserver(function (es) { stickyStart.hidden = es[0].isIntersecting || !stage.classList.contains('is-landing'); }).observe(first);
  } else if (FUNNEL && landing) startQuiz();
  else render();
})();
