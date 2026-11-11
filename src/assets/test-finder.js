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
  var lead = null;
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
      primary = pool.filter(function (h) { return total(h) <= cap; })[0] || custom(cap);
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

  function render() {
    var q = Q[step];
    bar.style.width = ((step + 1) / Q.length * 100) + '%';
    stepEl.textContent = (step + 1) + ' of ' + Q.length;
    back.hidden = step === 0;
    qEl.innerHTML = '';
    var h = el('h2', { id: 'tf-h', tabindex: '-1', text: q.q, style: "margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(24px, 3vw, 32px); letter-spacing: -0.02em" });
    qEl.appendChild(h);
    var list = el('div', { style: 'display: flex; flex-direction: column; gap: 10px', role: 'group', 'aria-labelledby': 'tf-h' });
    q.opts.forEach(function (o) {
      var b = el('button', { type: 'button', class: 'tf-opt', 'aria-pressed': String(A[q.id] === o[0]), onclick: function () { A[q.id] = o[0]; next(); } },
        [el('span', {}, [document.createTextNode(o[1]), o[2] ? el('small', { text: o[2] }) : null]), el('span', { 'aria-hidden': 'true', text: '→', style: 'color: #A4502E' })]);
      list.appendChild(b);
    });
    qEl.appendChild(list);
  }
  function focusQ() { var h = document.getElementById('tf-h'); if (h) h.focus(); }
  function next() {
    if (A.goal === 'sexual' && step === 1) { A.depth = A.depth || 'essential'; }
    step++;
    if (A.goal === 'sexual' && Q[step] && Q[step].id === 'depth') step++;
    if (step >= Q.length) return FUNNEL && !lead ? gate() : show();
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
      el('span', { text: t.title, style: "font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: " + (primary ? '34px' : '24px') + '; letter-spacing: -0.02em; line-height: 1.1' }),
      inc ? el('span', { text: 'Quiz offer: nurse home visit included' + (homeFee ? ' (normally ' + homeFee + ')' : ''), style: 'align-self: flex-start; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; ' + (primary ? 'background: #F2A981; color: #1C2420' : 'background: #E8EDE6; color: #17302A') }) : null,
      primary ? el('p', { text: (A.goal === 'hormones' && A.sex === 'male' ? 'The hormones most linked to energy, mood, libido and recovery, measured together so they can be read in context.' : WHY[A.goal]) || '', style: 'margin: 0; color: #C5D1CA; font-size: 17px' }) : null,
      el('span', { text: (t.count === '1' ? '1 test' : t.count + ' tests') + ' · ' + t.includes, style: 'color: ' + (primary ? '#C5D1CA' : '#4B5650') + '; font-size: 15px' }),
      el('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; margin-top: 6px' }, [
        el('span', { text: priceLine, style: "font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: " + (primary ? '30px' : '22px') }),
        el('a', { href: href, class: 'btn', text: t.builder ? 'Build this test' : direct ? (primary ? 'Book this test' : 'Choose this test') : primary ? 'View and order' : 'View test', style: primary ? 'background: #F2A981; color: #1C2420' : 'border: 1px solid #1C2420' })
      ]),
      direct ? el('span', { style: 'font-size: 14px; color: ' + (primary ? '#C5D1CA' : '#5A645E') }, [
        document.createTextNode('Doctor review included. No referral needed. ' + (inc && A.where !== 'home' ? 'Prefer a nurse at home? Choose it at checkout and the visit is included. ' : '')),
        el('a', { href: t.url, text: 'See what is tested', style: 'text-decoration: underline; color: inherit' })
      ]) : null
    ]);
  }

  // ---------- Funnel result: a sales page built from the answers ----------
  var H2 = "margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1";
  function money(n) { return '$' + (Math.round(n * 100) % 100 === 0 ? Math.round(n) : n.toFixed(2)); }
  function href(h) {
    var t = info(h);
    if (t.builder) return '/checkout?add=' + t.slugs.join(',') + (A.where === 'home' ? '&home=1' : '');
    if (t.homeOnly) return t.url;
    return '/checkout?panel=' + encodeURIComponent(h) + (A.where === 'home' ? '&home=1' : '') + '&offer=quiz';
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
  function mainCard(h) {
    var t = info(h), inc = included(t), home = A.where === 'home', tot = total(h), cap = CAP[A.budget] || Infinity;
    var sub = '#C5D1CA', n = (t.markers || []).length || Number(t.count);
    var gets = [
      n + (n === 1 ? ' test' : ' tests') + ' from one collection',
      'Your pathology request form, issued with your order. No referral or GP visit needed',
      'A report reviewed by an Australian doctor, emailed to you with reference ranges',
      home ? (inc ? 'A registered nurse comes to your home or workplace, included' + (homeFee ? ' (normally ' + homeFee + ')' : '') : 'A registered nurse comes to your home or workplace' + (homeAdd(t) ? ' (' + money(homeAdd(t)) + ')' : ''))
           : 'Collection at any of 2,000+ partner centres' + (inc ? ', or a nurse at home included at checkout' : ''),
      'Processed by a NATA-accredited laboratory'
    ];
    var badge = overBudget ? 'Closest to your budget' : cap !== Infinity ? 'Fits your budget' : 'Our most complete option';
    return el('div', { id: 'tf-main', style: 'display: flex; flex-direction: column; gap: 16px; padding: clamp(24px, 4vw, 36px); border-radius: 28px; background: #17302A; color: #F7F4EF' }, [
      el('div', { style: 'display: flex; flex-wrap: wrap; gap: 8px' }, [
        el('span', { text: 'Our recommendation', style: 'font-size: 13px; font-weight: 700; color: #F2A981; padding: 6px 0' }),
        el('span', { text: badge, style: 'padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; background: rgba(255,255,255,0.12)' }),
        inc ? el('span', { text: 'Nurse home visit included', style: 'padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; background: #F2A981; color: #1C2420' }) : null
      ]),
      el('h3', { text: t.title, style: H2 + '; font-size: clamp(30px, 5vw, 40px)' }),
      el('p', { text: (A.goal === 'hormones' && A.sex === 'male' ? 'The hormones most linked to energy, mood, libido and recovery, measured together so they can be read in context.' : WHY[A.goal]) || '', style: 'margin: 0; color: ' + sub + '; font-size: 17px' }),
      el('div', { style: 'display: flex; flex-direction: column; gap: 10px' }, [
        el('strong', { text: 'What is tested', style: 'font-size: 15px' }),
        el('ul', { style: 'margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px' }, (t.markers || []).map(function (m) {
          return el('li', { text: m, style: 'padding: 5px 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.25); font-size: 14px' }); }))
      ]),
      el('div', { style: 'display: flex; flex-direction: column; gap: 10px' }, [
        el('strong', { text: 'What you get', style: 'font-size: 15px' }),
        el('ul', { style: 'margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; color: ' + sub }, gets.map(function (g) { return tick(g, true); }))
      ]),
      t.single ? el('p', { style: 'margin: 0; padding: 14px 16px; border-radius: 16px; background: rgba(255,255,255,0.08); font-size: 15px' }, [
        document.createTextNode('These ' + n + ' tests ordered one by one through Build Your Own: '), el('s', { text: money(t.single) }),
        document.createTextNode('. As this panel: '), el('strong', { text: money(t.price) }), document.createTextNode('.')]) : null,
      el('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px' }, [
        el('span', { style: 'display: flex; flex-direction: column' }, [
          el('span', { text: money(tot), style: "font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 40px; letter-spacing: -0.03em; line-height: 1" }),
          el('span', { text: home ? (inc ? 'Home visit included' : t.homeOnly ? 'Including home visit' : homeAdd(t) ? 'Including ' + money(homeAdd(t)) + ' home visit' : '') : 'One payment. Doctor review included', style: 'font-size: 14px; color: ' + sub })]),
        el('a', { href: href(h), class: 'btn', id: 'tf-cta', text: 'Book this test', style: 'background: #F2A981; color: #1C2420; min-height: 56px; padding: 0 30px; font-size: 17px; flex: 1 1 200px' })
      ]),
      el('span', { text: 'Secure payment by Stripe. If we cannot arrange your collection, you receive a full refund.', style: 'font-size: 14px; color: ' + sub })
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
        el('span', { text: money(total(h)), style: "font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 24px" }),
        el('a', { href: href(h), class: 'btn', text: 'Choose this test', style: 'border: 1px solid #1C2420' })])
    ]);
  }
  function showFunnel(p) {
    var first = lead && lead.name ? lead.name.split(' ')[0] : '';
    resEl.appendChild(el('div', { style: 'display: flex; flex-direction: column; gap: 12px' }, [
      el('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 12px' }, [
        el('h2', { id: 'tf-res-h', tabindex: '-1', text: (first ? first + ', here' : 'Here') + ' is the test for you', style: H2 + '; font-size: clamp(28px, 3.4vw, 40px)' }),
        el('button', { type: 'button', class: 'tf-link', text: 'Start again', onclick: function () { A = {}; step = 0; resEl.hidden = true; box.hidden = false; var b = document.getElementById('tf-sticky'); if (b) b.remove(); var intro = document.getElementById('quiz-intro'); if (intro) intro.hidden = false; render(); focusQ(); } })]),
      el('ul', { 'aria-label': 'Your answers', style: 'margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px' }, answerChips().map(function (c) {
        return el('li', { text: c, style: 'padding: 5px 11px; border-radius: 999px; background: #E8EDE6; font-size: 14px; font-weight: 600' }); }))
    ]));
    resEl.appendChild(mainCard(p[0]));
    if (p.length > 1) {
      resEl.appendChild(el('h3', { text: 'Working to a different budget?', style: H2 + '; font-size: 24px; margin-top: 8px' }));
      var alts = el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px' });
      p.slice(1).forEach(function (h) { alts.appendChild(altCard(h, p[0])); });
      resEl.appendChild(alts);
    }
    var g = PRIORITY[A.goal] || PRIORITY.general, own = (g[A.sex] || g.any || []).filter(function (s) { return ADD[s]; });
    resEl.appendChild(el('p', { style: 'margin: 0; padding: 20px 24px; border-radius: 22px; background: #E8EDE6; font-size: 16px' }, [
      el('strong', { text: 'We can make a test work for any budget. ' }),
      document.createTextNode('Every test is also available on its own, from ' + money(Math.min.apply(null, Object.keys(ADD).map(function (k) { return ADD[k].price; }))) + ' each plus a ' + money(BASE) + ' fee. '),
      el('a', { href: '/tests?add=' + own.slice(0, 2).join(',') + (A.where === 'home' ? '&collect=home' : '') + '#build', text: 'Build your own', style: 'font-weight: 700; text-decoration: underline' }), document.createTextNode('.')]));
    resEl.appendChild(el('p', { style: 'margin: 0; font-size: 14px; color: #5A645E' }, [
      document.createTextNode((lead && lead.sent ? 'We have emailed you a copy. ' : '') + 'Knowing your numbers gives you and your doctor a baseline to work from. '),
      HOME_FROM ? el('a', { href: '#offer-terms', text: 'Quiz offer terms', style: 'text-decoration: underline' }) : null, document.createTextNode(HOME_FROM ? ' apply.' : '')]));
    // Order bar that stays in view once the main button has scrolled away
    var t = info(p[0]), cta = document.getElementById('tf-cta');
    var barEl = el('div', { id: 'tf-sticky', hidden: '', style: 'position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; background: #FFFFFF; border-top: 1px solid #DCE0D8; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); display: flex; justify-content: center' }, [
      el('div', { style: 'width: 100%; max-width: 832px; display: flex; align-items: center; justify-content: space-between; gap: 12px' }, [
        el('span', { style: 'display: flex; flex-direction: column; min-width: 0' }, [
          el('strong', { text: t.title, style: 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis' }),
          el('span', { text: money(total(p[0])) + (included(t) && A.where === 'home' ? ' with home visit included' : ''), style: 'font-size: 14px; color: #4B5650' })]),
        el('a', { href: href(p[0]), class: 'btn btn-dark', text: 'Book this test', style: 'flex: none' })])]);
    document.body.appendChild(barEl);
    if (cta && 'IntersectionObserver' in window) new IntersectionObserver(function (es) { barEl.hidden = es[0].isIntersecting || resEl.hidden; }).observe(cta);
  }

  // Funnel mode: first name and email before the result
  function gate() {
    step = Q.length;
    bar.style.width = '100%'; stepEl.textContent = 'Done'; back.hidden = false;
    qEl.innerHTML = '';
    var p = picks();
    var inp = 'min-height: 54px; border: 1px solid #D3D8D0; border-radius: 14px; padding: 0 14px; font: inherit; background: #FFFFFF; color: #1C2420; width: 100%';
    var status = el('p', { class: 'form-status', role: 'status', 'aria-live': 'polite', style: 'margin: 0' });
    var form = el('form', { novalidate: '', style: 'display: flex; flex-direction: column; gap: 14px' }, [
      el('h2', { id: 'tf-h', tabindex: '-1', text: 'Your recommendation is ready.', style: "margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(24px, 3vw, 32px); letter-spacing: -0.02em" }),
      el('p', { text: 'Where should we send a copy?', style: 'margin: 0; color: #4B5650; font-size: 17px' }),
      el('label', { for: 'tf-name', class: 'sr-only', text: 'First name' }), el('input', { id: 'tf-name', name: 'name', required: '', autocomplete: 'given-name', placeholder: 'First name', style: inp }),
      el('label', { for: 'tf-email', class: 'sr-only', text: 'Email' }), el('input', { id: 'tf-email', name: 'email', type: 'email', required: '', autocomplete: 'email', inputmode: 'email', placeholder: 'Email', style: inp }),
      el('input', { name: 'company_website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', style: 'position: absolute; left: -9999px; width: 1px; height: 1px' }),
      el('button', { type: 'submit', class: 'btn btn-dark', text: 'Show my recommendation', style: 'min-height: 56px; font-size: 17px' }),
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
      lead = { name: form.name.value.trim(), email: form.email.value.trim() };
      var done = false, go = function () { if (done) return; done = true; show(); };
      setTimeout(go, 4000); // never hold the result back if the request is slow
      fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        kind: 'quiz', offer: 'quiz', page: location.pathname, name: lead.name, email: lead.email, company_website: form.company_website.value,
        collection: A.where === 'home' ? 'home' : 'centre',
        topic: 'Quiz funnel: ' + (p[0] ? info(p[0]).title : 'no match'),
        message: 'Recommended: ' + p.map(function (h) { return info(h).title; }).join(', ') + '\nAnswers: ' + JSON.stringify(A),
        recommendation: p.filter(function (h) { return h.indexOf('b:') !== 0; }).join(',')
      }) }).then(function (r) {
        if (!r.ok) throw new Error();
        // Lead events carry no answers or test names
        lead.sent = true;
        if (window.epTrack) window.epTrack('test_finder_lead', {});
        if (window.fbq) window.fbq('track', 'Lead');
      }).catch(function () {}).then(go);
    });
    qEl.appendChild(form);
    focusQ();
  }

  function show() {
    var p = picks();
    box.hidden = true; resEl.hidden = false; resEl.innerHTML = '';
    if (FUNNEL && p.length) {
      showFunnel(p);
      var top = document.getElementById('quiz-intro'); if (top) top.hidden = true;
      window.scrollTo(0, 0);
      var hf = document.getElementById('tf-res-h'); if (hf) hf.focus({ preventScroll: true });
      if (window.gtag) window.gtag('event', 'test_finder_complete', {});
      return;
    }
    var head = el('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 12px' }, [
      el('h2', { id: 'tf-res-h', tabindex: '-1', text: lead && lead.name ? lead.name.split(' ')[0] + ', here is your recommended test' : 'Your recommended test', style: "margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(28px, 3.4vw, 40px); letter-spacing: -0.03em" }),
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
        message: 'Recommended: ' + p.map(function (h) { return info(h).title; }).join(', ') + '\nAnswers: ' + JSON.stringify(A),
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

  render();
})();
