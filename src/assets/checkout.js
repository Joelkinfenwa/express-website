/* Checkout: shows the order from the URL (?panel=handle or ?add=slug,slug, plus &home=1),
   collects patient details, then hands off to Stripe via /api/checkout. Prices shown here are for
   display only; the server recalculates every price. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('co-form'); if (!form) return;
  var params = new URLSearchParams(location.search);
  var fmt0 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }), fmt2 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fmt = { format: function (n) { return (Math.round(n * 100) % 100 === 0 ? fmt0 : fmt2).format(n); } };
  var order = { type: params.get('panel') ? 'panel' : 'builder', panel: params.get('panel') || '', tests: (params.get('add') || '').split(',').filter(Boolean) };
  var offer = params.get('offer') || '';
  var addTo = /^\d{4,8}$/.test(params.get('addto') || '') ? params.get('addto') : '';
  var cat = null, cov = null;
  function pct() { return offer === 'quiz10' && cat && cat.quizDiscount ? cat.quizDiscount : 0; }
  // Timed result-page offer: $25 off tests of $200 or more until the signed deadline in the link (checked again by the server)
  var NOW_OFF = 25, NOW_MIN = 200, nowX = Number(params.get('x') || 0), nowS = params.get('s') || '';
  function nowOff(sub) { return offer === 'now' && nowX > Date.now() && sub >= NOW_MIN ? NOW_OFF : 0; }
  function nowNote() { return '$' + NOW_OFF + ' offer applied. Ends at ' + new Date(nowX).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) + '.'; }
  function homeIncluded() { var p = cat && cat.panels[order.panel]; return offer === 'quiz' && !!p && !!cat.quizHomeFrom && p.price >= cat.quizHomeFrom && !!cat.homeVisit; }
  var radios = form.querySelectorAll('input[name="collect"]');
  if (params.get('home') === '1') radios[1].checked = true;

  function home() { return form.querySelector('input[name="collect"]:checked').value === 'home'; }
  function lines() {
    if (!cat) return [];
    var out = [];
    if (order.type === 'panel') {
      var p = cat.panels[order.panel]; if (p) out.push([p.title, nowOff(p.price) ? p.price - NOW_OFF : pct() ? Math.round(p.price * (100 - pct())) / 100 : p.price, p.count + ' tests' + (pct() ? ' · ' + pct() + '% quiz offer applied' : '') + (nowOff(p.price) ? ' · ' + nowNote() : '')]);
    } else {
      var chosen = cat.addons.filter(function (a) { return order.tests.indexOf(a.slug) !== -1; });
      var addOn = !!addTo;
      var sub = (cat.base && !addOn ? cat.base.price : 0) + chosen.reduce(function (a, x) { return a + x.price; }, 0);
      var off = !addOn && cat.base && cat.base.price >= NOW_OFF ? nowOff(sub) : 0;
      if (chosen.length && cat.base && !addOn) out.push(['Build your own test fee', cat.base.price - off, off ? nowNote() : '']);
      chosen.forEach(function (a) { out.push([a.title, a.price, addOn ? 'Added to order #' + addTo + '. Use the email from that order.' : '']); });
    }
    if (out.length && home() && cat.homeVisit) out.push(homeIncluded() ? ['Home visit', 0, 'Included with your quiz offer'] : ['Home visit', cat.homeVisit.price]);
    return out;
  }
  function render() {
    var ls = lines(), ul = $('co-lines'); ul.innerHTML = '';
    ls.forEach(function (l) {
      var li = document.createElement('li');
      li.style.cssText = 'display:flex;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid #C9D3CB';
      li.innerHTML = '<span style="display:flex;flex-direction:column"><span style="font-weight:600"></span><span style="font-size:14px;color:#4B5650"></span></span><span style="font-weight:700"></span>';
      li.children[0].children[0].textContent = l[0]; li.children[0].children[1].textContent = l[2] || ''; li.children[1].textContent = l[1] === 0 ? 'Included' : fmt.format(l[1]);
      ul.appendChild(li);
    });
    $('co-total').textContent = fmt.format(ls.reduce(function (a, l) { return a + l[1]; }, 0));
    $('co-edit').href = order.type === 'panel' ? '/tests/' + encodeURIComponent(order.panel) : '/tests?add=' + order.tests.join(',') + '#build';
    $('co-visit').hidden = !home();
    if (cat && cat.homeVisit) $('co-home-fee').textContent = homeIncluded() ? 'A registered nurse comes to you, included with your quiz offer' : 'A registered nurse comes to you, +' + fmt.format(cat.homeVisit.price);
    if (cat && !ls.length) { $('co-status').setAttribute('data-state', 'error'); $('co-status').textContent = 'Your order is empty. Choose a panel or build your own test first.'; $('co-submit').disabled = true; }
    coverage();
  }
  function coverage() {
    var out = $('co-cover'), pc = $('co-postcode').value.replace(/\D/g, '');
    out.textContent = ''; out.removeAttribute('data-state'); out.className = 'form-status';
    if (!home() || !cov || pc.length !== 4) return true;
    var ok = cov.metro.indexOf(pc) !== -1 || cov.regional.indexOf(pc) !== -1;
    out.setAttribute('data-state', 'ok');
    out.textContent = ok ? 'Home visits are available in ' + pc + '.' : 'Our team will confirm your nurse in ' + pc + ' after booking. If we cannot arrange a visit, we will refund you in full.';
    return true;
  }
  Array.prototype.forEach.call(radios, function (r) { r.addEventListener('change', render); });
  $('co-postcode').addEventListener('input', coverage);
  var today = new Date(); today.setDate(today.getDate() + 1); $('co-date').min = today.toISOString().slice(0, 10);

  Promise.all([
    fetch('/assets/catalog.json').then(function (r) { return r.json(); }),
    fetch('/assets/coverage.json').then(function (r) { return r.json(); }).catch(function () { return null; })
  ]).then(function (res) {
    cat = res[0]; cov = res[1]; render();
    if (window.epStep) { var tot0 = lines().reduce(function (a, l) { return a + l[1]; }, 0); window.epStep('6 Checkout page viewed', { offer: offer || 'none' }, 'InitiateCheckout', { value: tot0, currency: 'AUD' }); }
    // When the timed offer runs out on this page, drop it and show the standard price straight away
    if (offer === 'now') {
      var endNow = function () { offer = ''; render(); $('co-status').removeAttribute('data-state'); $('co-status').textContent = 'The 15-minute offer has ended. The price shown is now the standard price.'; };
      if (nowX <= Date.now()) { offer = ''; render(); } else setTimeout(endNow, Math.min(nowX - Date.now(), 2147483000));
    }
  }).catch(function () {
    $('co-status').setAttribute('data-state', 'error'); $('co-status').textContent = 'We could not load your order. Please refresh the page.';
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var status = $('co-status'), btn = $('co-submit');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (!coverage()) { $('co-postcode').focus(); return; }
    var f = new FormData(form), patient = {};
    ['firstName', 'lastName', 'dob', 'sex', 'email', 'phone', 'address', 'suburb', 'state', 'postcode'].forEach(function (k) { patient[k] = String(f.get(k) || ''); });
    var body = { type: order.type, panel: order.panel, tests: order.tests, home: home(), offer: offer, addto: addTo, patient: patient, preferredDate: home() ? f.get('preferredDate') : '', preferredTime: home() ? f.get('preferredTime') : '', notes: f.get('notes'), src: window.epSrc ? window.epSrc() : '', x: offer === 'now' ? nowX : undefined, s: offer === 'now' ? nowS : undefined };
    btn.disabled = true; btn.textContent = 'Opening secure payment…'; status.removeAttribute('data-state'); status.textContent = '';
    if (window.epStep) window.epStep('7 Details entered, sent to payment', {}, 'AddPaymentInfo', { value: lines().reduce(function (a, l) { return a + l[1]; }, 0), currency: 'AUD' });
    if (window.epTrack) window.epTrack('begin_checkout', { currency: 'AUD', value: lines().reduce(function (a, l) { return a + l[1]; }, 0) });
    fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok && x.j.url) { location.href = x.j.url; return; }
        if (x.j.code === 'offer_ended') { offer = ''; render(); }
        throw new Error(x.j.error || 'Checkout failed');
      })
      .catch(function (err) {
        status.setAttribute('data-state', 'error');
        status.textContent = err && err.message && err.message !== 'Failed to fetch' ? err.message : 'We could not start checkout. Please try again, or call us on 02 9545 2940.';
        btn.disabled = false; btn.textContent = 'Continue to secure payment';
      });
  });
})();
