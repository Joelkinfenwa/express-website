/* Quiz exit builder (/quiz only): when a visitor looks about to leave, offer to build a test around
   exactly what they want checked and what they want to spend. Prices come from the Build Your Own
   catalogue; the server recalculates them at checkout. Shown once per visit.
   Triggers: pointer leaving the top of the window (desktop), the back button, or 40 seconds without
   any interaction. Add ?exit=1 to the URL to open it straight away for review. */
(function () {
  'use strict';
  var box = document.getElementById('tf'), dataEl = document.getElementById('tf-data');
  if (!box || !dataEl || box.getAttribute('data-mode') !== 'funnel') return;
  var D = {}; try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var ADD = D.addons || {}, T = D.tests || {}, BASE = D.base || 0, HOME = D.homeVisit || 0;
  if (!Object.keys(ADD).length) return;

  // What people ask to have checked, each with single tests in priority order
  var AREAS = [
    { id: 'mhorm', label: 'Testosterone and male hormones', sex: 'male', tests: ['free-and-total-testosterone', 'shbg', 'lh-and-fsh', 'oestradiol-e2', 'prolactin'] },
    { id: 'fhorm', label: 'Female hormones', sex: 'female', tests: ['oestradiol-e2', 'progesterone', 'lh-and-fsh', 'prolactin', 'free-and-total-testosterone'] },
    { id: 'thyroid', label: 'Thyroid', tests: ['tsh-t3-and-t4', 'tpo-antibodies', 'thyroglobulin-antibodies'] },
    { id: 'heart', label: 'Cholesterol and heart', tests: ['lipid-profile', 'apo-b', 'lp-a', 'crp'] },
    { id: 'sugar', label: 'Blood sugar and metabolism', tests: ['hba1c', 'fasting-insulin'] },
    { id: 'vits', label: 'Iron and vitamins', tests: ['iron-studies', 'vitamin-d', 'vitamin-b12', 'vitamin-b9-folate'] },
    { id: 'organs', label: 'Liver and kidneys', tests: ['liver-function', 'kidney-function'] },
    { id: 'blood', label: 'General blood health', tests: ['full-blood-count-and-esr', 'general-biochemistry'] },
    { id: 'stress', label: 'Stress and recovery', tests: ['cortisol', 'dheas', 'igf-1'] },
    { id: 'psa', label: 'Prostate (PSA)', sex: 'male', tests: ['psa'] }
  ].map(function (a) { a.tests = a.tests.filter(function (s) { return ADD[s]; }); return a; }).filter(function (a) { return a.tests.length; });
  var GOAL_AREA = { hormones: ['mhorm', 'fhorm'], performance: ['mhorm', 'stress'], thyroid: ['thyroid'], vitamins: ['vits'], general: ['blood', 'organs'], longevity: ['heart', 'sugar'] };
  var CAP = { b150: 150, b300: 300, b450: 450 };

  var quiz = function () { return (window.epQuiz && window.epQuiz()) || { answers: {}, lead: null }; };
  var shown = false, picked = {}, order = [], budget = 200, home = false, dlg = null, lastFocus = null;
  function seen() { try { return sessionStorage.getItem('ep-exit') === '1'; } catch (e) { return false; } }
  function mark() { try { sessionStorage.setItem('ep-exit', '1'); } catch (e) {} }
  function money(n) { return '$' + (Math.round(n * 100) % 100 === 0 ? Math.round(n) : n.toFixed(2)); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  // Fill the budget one test at a time, taking turns across the chosen areas so each gets covered
  function build() {
    var room = budget - BASE - (home ? HOME : 0), chosen = [], left = [], sum = 0, used = {};
    var lists = order.map(function (id) { return AREAS.filter(function (a) { return a.id === id; })[0].tests.slice(); });
    for (var round = 0, more = true; more; round++) {
      more = false;
      lists.forEach(function (l) {
        var s = l[round]; if (!s) return; more = true;
        if (used[s]) return; used[s] = 1;
        if (sum + ADD[s].price <= room) { chosen.push(s); sum += ADD[s].price; } else left.push(s);
      });
    }
    return { tests: chosen, left: left, total: chosen.length ? sum + BASE + (home ? HOME : 0) : 0 };
  }
  // A panel that already contains every chosen test, for about the same money or less
  function betterPanel(b) {
    if (b.tests.length < 2) return null;
    var best = null;
    Object.keys(T).forEach(function (h) {
      var t = T[h]; if (!t.slugs || t.homeOnly) return;
      if (!b.tests.every(function (s) { return t.slugs.indexOf(s) !== -1; })) return;
      var inc = D.quizHomeFrom && t.price >= D.quizHomeFrom, tot = t.price + (home && !inc ? HOME : 0);
      if (tot <= b.total + 60 && tot <= budget + 60 && (!best || tot < best.total)) best = { h: h, t: t, total: tot, inc: inc, extra: (t.markers || []).length - b.tests.length };
    });
    return best && best.extra > 0 ? best : null;
  }

  function renderResult() {
    var out = document.getElementById('qx-out'); if (!out) return;
    out.innerHTML = '';
    document.getElementById('qx-budget-val').textContent = money(budget);
    var bar = function (total, subText, link) { var c = document.getElementById('qx-bar-cta'); document.getElementById('qx-bar-total').textContent = total; document.getElementById('qx-bar-sub').textContent = subText; c.hidden = !link; if (link) c.href = link; };
    bar('', 'Choose what you would like checked', '');
    if (!order.length) { out.appendChild(el('p', { text: 'Choose at least one area above and we will build your test.', style: 'margin: 0; color: #4B5650' })); return; }
    var b = build();
    if (!b.tests.length) { bar('', 'Move the budget up to add a test', ''); out.appendChild(el('p', { text: 'That budget does not cover a test' + (home ? ' with a home visit' : '') + ' yet. Move the slider up' + (home ? ', or choose a collection centre.' : '.'), style: 'margin: 0; color: #9B2C1F; font-weight: 600' })); return; }
    out.appendChild(el('ul', { style: 'margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column' },
      b.tests.map(function (s) { return el('li', { style: 'display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid #DCE0D8' }, [el('span', { text: ADD[s].title, style: 'font-weight: 600' }), el('span', { text: money(ADD[s].price) })]); })
        .concat([el('li', { style: 'display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid #DCE0D8; color: #4B5650' }, [el('span', { text: 'Build your own fee (one collection, one report)' }), el('span', { text: money(BASE) })]),
          home ? el('li', { style: 'display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid #DCE0D8; color: #4B5650' }, [el('span', { text: 'Nurse home visit' }), el('span', { text: money(HOME) })]) : null])));
    if (b.left.length) {
      var nx = b.left[0];
      out.appendChild(el('p', { text: 'Not included at this budget: ' + b.left.slice(0, 3).map(function (s) { return ADD[s].title; }).join(', ') + (b.left.length > 3 ? ' and ' + (b.left.length - 3) + ' more' : '') + '. ' + money(ADD[nx].price) + ' more adds ' + ADD[nx].title + '.', style: 'margin: 0; font-size: 14px; color: #5A645E' }));
    }
    var href = '/checkout?add=' + b.tests.join(',') + (home ? '&home=1' : '');
    bar(money(b.total), b.tests.length + (b.tests.length === 1 ? ' test' : ' tests') + (home ? ' with home visit' : ''), href);
    out.appendChild(el('div', { style: 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px' }, [
      el('span', { style: 'display: flex; flex-direction: column' }, [
        el('span', { text: money(b.total), style: "font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; font-size: 34px; letter-spacing: -0.03em; line-height: 1" }),
        el('span', { text: b.tests.length + (b.tests.length === 1 ? ' test' : ' tests') + ', one collection, no referral needed', style: 'font-size: 14px; color: #4B5650' })]),
      el('a', { href: href, class: 'btn btn-dark', text: 'Book this test', style: 'min-height: 54px; padding: 0 28px; font-size: 17px; flex: 1 1 180px', onclick: function () { if (window.gtag) window.gtag('event', 'quiz_exit_builder_checkout', {}); } })]));
    var bp = betterPanel(b);
    if (bp) out.appendChild(el('p', { style: 'margin: 0; padding: 14px 16px; border-radius: 16px; background: #E8EDE6; font-size: 15px' }, [
      el('strong', { text: 'Better value: ' }), document.createTextNode('the ' + bp.t.title + ' includes all of these plus ' + bp.extra + ' more ' + (bp.extra === 1 ? 'test' : 'tests') + ' for ' + money(bp.total) + (bp.inc && home ? ' with the home visit included' : '') + '. '),
      el('a', { href: '/checkout?panel=' + encodeURIComponent(bp.h) + (home ? '&home=1' : '') + '&offer=quiz', text: 'Choose the panel', style: 'font-weight: 700; text-decoration: underline' })]));
    // Email it instead (only asked when we do not already have their email)
    if (!quiz().lead) {
      var status = el('p', { class: 'form-status', role: 'status', 'aria-live': 'polite', style: 'margin: 0' });
      var inp = 'min-height: 48px; border: 1px solid #D3D8D0; border-radius: 14px; padding: 0 14px; font: inherit; background: #FFFFFF; color: #1C2420; min-width: 0; flex: 1 1 140px';
      var form = el('form', { novalidate: '', style: 'display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding-top: 4px' }, [
        el('span', { text: 'Not ready? We will email this test to you.', style: 'flex: 1 1 100%; font-weight: 700; font-size: 15px' }),
        el('label', { for: 'qx-name', class: 'sr-only', text: 'First name' }), el('input', { id: 'qx-name', name: 'name', required: '', autocomplete: 'given-name', placeholder: 'First name', style: inp }),
        el('label', { for: 'qx-email', class: 'sr-only', text: 'Email' }), el('input', { id: 'qx-email', name: 'email', type: 'email', required: '', autocomplete: 'email', placeholder: 'Email', style: inp }),
        el('button', { type: 'submit', class: 'btn', text: 'Email me', style: 'border: 1px solid #1C2420; background: #FFFFFF; min-height: 48px' }),
        status,
        el('span', { text: 'We will email your test and occasional offers from Express Pathology. Unsubscribe at any time.', style: 'flex: 1 1 100%; font-size: 13px; color: #5A645E' })]);
      form.addEventListener('submit', function (e) {
        e.preventDefault(); if (!form.checkValidity()) { form.reportValidity(); return; }
        var btn = form.querySelector('button'), cur = build(); btn.disabled = true; status.removeAttribute('data-state'); status.textContent = 'Sending…';
        fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          kind: 'quiz', offer: 'quiz', page: location.pathname, name: form.name.value.trim(), email: form.email.value.trim(), collection: home ? 'home' : 'centre',
          topic: 'Quiz exit builder: custom test', tests: cur.tests.join(','),
          message: 'Custom test: ' + cur.tests.map(function (s) { return ADD[s].title; }).join(', ') + '\nBudget: ' + money(budget) }) })
          .then(function (r) { if (!r.ok) throw new Error(); status.setAttribute('data-state', 'ok'); status.textContent = 'Sent. Check your inbox shortly.'; if (window.epTrack) window.epTrack('test_finder_lead', {}); if (window.fbq) window.fbq('track', 'Lead'); })
          .catch(function () { status.setAttribute('data-state', 'error'); status.textContent = 'That did not send. Please try again.'; btn.disabled = false; });
      });
      out.appendChild(form);
    }
  }

  function chip(a) {
    var b = el('button', { type: 'button', 'aria-pressed': String(!!picked[a.id]), text: a.label,
      style: 'min-height: 44px; padding: 0 16px; border-radius: 999px; font: inherit; font-weight: 600; font-size: 15px; cursor: pointer; border: 1px solid #17302A; ' + (picked[a.id] ? 'background: #17302A; color: #F7F4EF' : 'background: #FFFFFF; color: #1C2420'),
      onclick: function () {
        if (picked[a.id]) { delete picked[a.id]; order = order.filter(function (x) { return x !== a.id; }); } else { picked[a.id] = 1; order.push(a.id); }
        var on = !!picked[a.id]; b.setAttribute('aria-pressed', String(on)); b.style.background = on ? '#17302A' : '#FFFFFF'; b.style.color = on ? '#F7F4EF' : '#1C2420';
        renderResult();
      } });
    return b;
  }

  function close() { if (!dlg) return; dlg.remove(); dlg = null; document.body.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function open() {
    if (shown || dlg) return; shown = true; mark();
    var A = quiz().answers || {};
    // Start from what the quiz already knows
    picked = {}; order = [];
    (GOAL_AREA[A.goal] || []).forEach(function (id) { var a = AREAS.filter(function (x) { return x.id === id; })[0]; if (a && (!a.sex || !A.sex || a.sex === A.sex) && !picked[id]) { picked[id] = 1; order.push(id); } });
    budget = CAP[A.budget] || 200; home = A.where === 'home';
    var areas = AREAS.filter(function (a) { return !a.sex || !A.sex || a.sex === A.sex; });
    var cheapest = Math.min.apply(null, Object.keys(ADD).map(function (k) { return ADD[k].price; }));
    var range = el('input', { id: 'qx-budget', type: 'range', min: String(Math.ceil((BASE + cheapest) / 10) * 10), max: '500', step: '10', value: String(budget), 'aria-label': 'Your budget', style: 'width: 100%; accent-color: #17302A; min-height: 32px' });
    range.addEventListener('input', function () { budget = Number(range.value); renderResult(); });
    var seg = function (val, label) { return el('label', { class: 'co-opt', style: 'flex: 1 1 200px; padding: 12px 14px' }, [el('input', Object.assign({ type: 'radio', name: 'qx-where', value: val, onchange: function () { home = val === 'home'; renderResult(); } }, (val === 'home') === home ? { checked: '' } : {})), el('span', {}, [el('strong', { text: label[0] }), el('small', { text: label[1] })])]); };
    var panel = el('div', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'qx-h', style: 'background: #F7F4EF; color: #1C2420; width: 100%; max-width: 640px; max-height: 92vh; overflow-y: auto; border-radius: 28px 28px 0 0; padding: 24px 24px 0; display: flex; flex-direction: column; gap: 18px; box-shadow: 0 -8px 40px rgba(0,0,0,0.25)' }, [
      el('div', { style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 12px' }, [
        el('div', { style: 'display: flex; flex-direction: column; gap: 6px' }, [
          el('span', { text: 'Before you go', style: 'font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #A4502E' }),
          el('h2', { id: 'qx-h', tabindex: '-1', text: 'Build a test around you.', style: "margin: 0; font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; font-size: clamp(26px, 5vw, 36px); letter-spacing: -0.03em; line-height: 1.05" }),
          el('p', { text: 'Tell us what you want checked and what you want to spend. We will fit the test to it.', style: 'margin: 0; color: #4B5650' })]),
        el('button', { type: 'button', 'aria-label': 'Close', text: '×', onclick: close, style: 'flex: none; width: 44px; height: 44px; border-radius: 999px; border: 1px solid #D3D8D0; background: #FFFFFF; font-size: 24px; line-height: 1; cursor: pointer' })]),
      el('div', { style: 'display: flex; flex-direction: column; gap: 10px' }, [
        el('strong', { text: '1. What would you like checked?' }),
        el('div', { role: 'group', 'aria-label': 'Areas to check', style: 'display: flex; flex-wrap: wrap; gap: 8px' }, areas.map(chip))]),
      el('div', { style: 'display: flex; flex-direction: column; gap: 6px' }, [
        el('div', { style: 'display: flex; justify-content: space-between; align-items: baseline' }, [el('strong', { text: '2. What is your budget?' }), el('span', { id: 'qx-budget-val', style: "font-family: var(--display, 'Instrument Sans', sans-serif); font-weight: 600; font-size: 24px" })]),
        range]),
      el('div', { style: 'display: flex; flex-direction: column; gap: 10px' }, [
        el('strong', { text: '3. Where would you like to be tested?' }),
        el('div', { style: 'display: flex; flex-wrap: wrap; gap: 8px' }, [seg('centre', ['Collection centre', '2,000+ partner centres, no extra fee']), seg('home', ['Nurse at home or work', HOME ? money(HOME) + ' home visit' : 'A registered nurse comes to you'])])]),
      el('div', { id: 'qx-out', 'aria-live': 'polite', style: 'background: #FFFFFF; border: 1px solid #DCE0D8; border-radius: 22px; padding: 20px; display: flex; flex-direction: column; gap: 14px' }),
      el('p', { text: 'This builds a test from your choices. It is not medical advice. If you have symptoms or a health concern, please speak with your doctor.', style: 'margin: 0; font-size: 13px; color: #5A645E' }),
      // Running total that stays in view while choices are made
      el('div', { id: 'qx-bar', style: 'position: sticky; bottom: 0; margin: 0 -24px; padding: 12px 24px calc(12px + env(safe-area-inset-bottom)); background: #FFFFFF; border-top: 1px solid #DCE0D8; display: flex; align-items: center; justify-content: space-between; gap: 12px' }, [
        el('span', { style: 'display: flex; flex-direction: column; min-width: 0' }, [el('strong', { id: 'qx-bar-total', style: "font-family: var(--display, 'Instrument Sans', sans-serif); font-size: 22px" }), el('span', { id: 'qx-bar-sub', style: 'font-size: 14px; color: #4B5650' })]),
        el('a', { id: 'qx-bar-cta', href: '#', class: 'btn btn-dark', text: 'Book this test', style: 'flex: none' })])
    ]);
    dlg = el('div', { id: 'qx', style: 'position: fixed; inset: 0; z-index: 60; background: rgba(23,48,42,0.55); display: flex; align-items: flex-end; justify-content: center', onclick: function (e) { if (e.target === dlg) close(); } }, [panel]);
    lastFocus = document.activeElement;
    document.body.appendChild(dlg); document.body.style.overflow = 'hidden';
    if (window.matchMedia && window.matchMedia('(min-width: 700px)').matches) { dlg.style.alignItems = 'center'; panel.style.borderRadius = '28px'; }
    renderResult();
    document.getElementById('qx-h').focus();
    if (window.gtag) window.gtag('event', 'quiz_exit_builder_open', {});
  }
  document.addEventListener('keydown', function (e) {
    if (!dlg) return;
    if (e.key === 'Escape') return close();
    if (e.key === 'Tab') { // keep focus inside the dialog
      var f = dlg.querySelectorAll('a[href], button:not([disabled]), input, [tabindex="-1"]'), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ---------- Triggers ----------
  if (/[?&]exit=1\b/.test(location.search)) { setTimeout(open, 300); return; }
  if (seen()) return;
  // Leaving for checkout is not an exit
  var leaving = false;
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="/checkout"]'); if (a) leaving = true; }, true);
  function trigger() { if (!leaving && !shown) open(); }
  // Desktop: pointer leaves through the top of the window
  document.addEventListener('mouseout', function (e) { if (!e.relatedTarget && e.clientY <= 0) trigger(); });
  // Back button: stay on the page once and show the builder; the next press leaves as normal
  try {
    history.pushState({ epQuiz: 1 }, '');
    window.addEventListener('popstate', function () { if (!shown && !leaving) open(); else if (!dlg) history.back(); });
  } catch (e) {}
  // No interaction for 40 seconds (the closest signal available on phones)
  var idle;
  function reset() { clearTimeout(idle); idle = setTimeout(function () { var a = document.activeElement; if (document.visibilityState === 'visible' && !document.querySelector('.is-landing') && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) trigger(); else reset(); }, 40000); }
  ['click', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, reset, { passive: true }); });
  reset();
})();
