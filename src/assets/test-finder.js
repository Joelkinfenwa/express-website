/* Test finder: five questions, then a recommended test plus two alternatives. */
(function () {
  'use strict';
  var box = document.getElementById('tf'), qEl = document.getElementById('tf-q'), bar = document.getElementById('tf-bar');
  var stepEl = document.getElementById('tf-step'), back = document.getElementById('tf-back'), resEl = document.getElementById('tf-result');
  var dataEl = document.getElementById('tf-data');
  if (!box || !dataEl) return;
  var D = {}; try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var T = D.tests || {}, ADD = D.addons || {}, BASE = D.base || 0;
  var homeFee = box.getAttribute('data-home-fee') || '';

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
      count: String(items.length), includes: 'Individual tests in one collection, including the $' + BASE + ' build-your-own fee' };
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

  function picks() {
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
    if (step >= Q.length) return show();
    render(); focusQ();
  }
  back.addEventListener('click', function () {
    step--;
    if (A.goal === 'sexual' && Q[step] && Q[step].id === 'depth') step--;
    render(); focusQ();
  });

  function card(h, primary) {
    var t = info(h);
    var priceLine = (t.builder ? '$' : '$') + t.price + (A.where === 'home' && homeFee ? ' + ' + homeFee + ' home visit' : '');
    if (t.homeOnly) priceLine = '$' + t.price + ' including home visit';
    return el('div', { style: 'display: flex; flex-direction: column; gap: 12px; padding: ' + (primary ? '32px' : '24px') + '; border-radius: 28px; ' + (primary ? 'background: #17302A; color: #F7F4EF' : 'background: #FFFFFF; border: 1px solid #DCE0D8') }, [
      el('span', { text: primary ? 'Our recommendation' : 'Also consider', style: 'font-size: 13px; font-weight: 700; color: ' + (primary ? '#F2A981' : '#A4502E') }),
      el('span', { text: t.title, style: "font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: " + (primary ? '34px' : '24px') + '; letter-spacing: -0.02em; line-height: 1.1' }),
      primary ? el('p', { text: (A.goal === 'hormones' && A.sex === 'male' ? 'The hormones most linked to energy, mood, libido and recovery, measured together so they can be read in context.' : WHY[A.goal]) || '', style: 'margin: 0; color: #C5D1CA; font-size: 17px' }) : null,
      el('span', { text: (t.count === '1' ? '1 test' : t.count + ' tests') + ' · ' + t.includes, style: 'color: ' + (primary ? '#C5D1CA' : '#4B5650') + '; font-size: 15px' }),
      el('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; margin-top: 6px' }, [
        el('span', { text: priceLine, style: "font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: " + (primary ? '30px' : '22px') }),
        el('a', { href: t.builder ? t.url : t.url + (A.where === 'home' ? '?collect=home' : ''), class: 'btn', text: t.builder ? 'Build this test' : primary ? 'View and order' : 'View test', style: primary ? 'background: #F2A981; color: #1C2420' : 'border: 1px solid #1C2420' })
      ])
    ]);
  }

  function show() {
    var p = picks();
    box.hidden = true; resEl.hidden = false; resEl.innerHTML = '';
    var head = el('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 12px' }, [
      el('h2', { id: 'tf-res-h', tabindex: '-1', text: 'Your recommended test', style: "margin: 0; font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: clamp(28px, 3.4vw, 40px); letter-spacing: -0.03em" }),
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
    resEl.appendChild(form);
    var h2 = document.getElementById('tf-res-h'); if (h2) h2.focus();
    if (window.gtag) window.gtag('event', 'test_finder_complete', { goal: A.goal, recommendation: p[0] });
  }

  render();
})();
