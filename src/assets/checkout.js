/* Checkout: shows the order from the URL (?panel=handle or ?add=slug,slug, plus &home=1),
   collects patient details, then hands off to Stripe via /api/checkout. Prices shown here are for
   display only; the server recalculates every price. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('co-form'); if (!form) return;
  var params = new URLSearchParams(location.search);
  var fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  var order = { type: params.get('panel') ? 'panel' : 'builder', panel: params.get('panel') || '', tests: (params.get('add') || '').split(',').filter(Boolean) };
  var cat = null, cov = null;
  var radios = form.querySelectorAll('input[name="collect"]');
  if (params.get('home') === '1') radios[1].checked = true;

  function home() { return form.querySelector('input[name="collect"]:checked').value === 'home'; }
  function lines() {
    if (!cat) return [];
    var out = [];
    if (order.type === 'panel') {
      var p = cat.panels[order.panel]; if (p) out.push([p.title, p.price, p.count + ' tests']);
    } else {
      var chosen = cat.addons.filter(function (a) { return order.tests.indexOf(a.slug) !== -1; });
      if (chosen.length && cat.base) out.push(['Build your own test fee', cat.base.price]);
      chosen.forEach(function (a) { out.push([a.title, a.price]); });
    }
    if (out.length && home() && cat.homeVisit) out.push(['Home visit', cat.homeVisit.price]);
    return out;
  }
  function render() {
    var ls = lines(), ul = $('co-lines'); ul.innerHTML = '';
    ls.forEach(function (l) {
      var li = document.createElement('li');
      li.style.cssText = 'display:flex;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid #C9D3CB';
      li.innerHTML = '<span style="display:flex;flex-direction:column"><span style="font-weight:600"></span><span style="font-size:14px;color:#4B5650"></span></span><span style="font-weight:700"></span>';
      li.children[0].children[0].textContent = l[0]; li.children[0].children[1].textContent = l[2] || ''; li.children[1].textContent = fmt.format(l[1]);
      ul.appendChild(li);
    });
    $('co-total').textContent = fmt.format(ls.reduce(function (a, l) { return a + l[1]; }, 0));
    $('co-edit').href = order.type === 'panel' ? '/tests/' + encodeURIComponent(order.panel) : '/tests?add=' + order.tests.join(',') + '#build';
    $('co-visit').hidden = !home();
    if (cat && cat.homeVisit) $('co-home-fee').textContent = 'A registered nurse comes to you, +' + fmt.format(cat.homeVisit.price);
    if (cat && !ls.length) { $('co-status').setAttribute('data-state', 'error'); $('co-status').textContent = 'Your order is empty. Choose a panel or build your own test first.'; $('co-submit').disabled = true; }
    coverage();
  }
  function coverage() {
    var out = $('co-cover'), pc = $('co-postcode').value.replace(/\D/g, '');
    out.textContent = ''; out.removeAttribute('data-state'); out.className = 'form-status';
    if (!home() || !cov || pc.length !== 4) return true;
    var ok = cov.metro.indexOf(pc) !== -1 || cov.regional.indexOf(pc) !== -1;
    out.setAttribute('data-state', ok ? 'ok' : 'error');
    out.textContent = ok ? 'Home visits are available in ' + pc + '.' : 'We do not currently list ' + pc + ' for home visits. Choose a collection centre, or contact us and our team will check.';
    return ok;
  }
  Array.prototype.forEach.call(radios, function (r) { r.addEventListener('change', render); });
  $('co-postcode').addEventListener('input', coverage);
  var today = new Date(); today.setDate(today.getDate() + 1); $('co-date').min = today.toISOString().slice(0, 10);

  Promise.all([
    fetch('/assets/catalog.json').then(function (r) { return r.json(); }),
    fetch('/assets/coverage.json').then(function (r) { return r.json(); }).catch(function () { return null; })
  ]).then(function (res) { cat = res[0]; cov = res[1]; render(); }).catch(function () {
    $('co-status').setAttribute('data-state', 'error'); $('co-status').textContent = 'We could not load your order. Please refresh the page.';
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var status = $('co-status'), btn = $('co-submit');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (!coverage()) { $('co-postcode').focus(); return; }
    var f = new FormData(form), patient = {};
    ['firstName', 'lastName', 'dob', 'sex', 'email', 'phone', 'address', 'suburb', 'state', 'postcode'].forEach(function (k) { patient[k] = String(f.get(k) || ''); });
    var body = { type: order.type, panel: order.panel, tests: order.tests, home: home(), patient: patient, preferredDate: home() ? f.get('preferredDate') : '', preferredTime: home() ? f.get('preferredTime') : '', notes: f.get('notes') };
    btn.disabled = true; btn.textContent = 'Opening secure payment…'; status.removeAttribute('data-state'); status.textContent = '';
    if (window.gtag) window.gtag('event', 'add_payment_info', { currency: 'AUD' });
    fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok && x.j.url) { location.href = x.j.url; return; }
        throw new Error(x.j.error || 'Checkout failed');
      })
      .catch(function (err) {
        status.setAttribute('data-state', 'error');
        status.textContent = err && err.message && err.message !== 'Failed to fetch' ? err.message : 'We could not start checkout. Please try again, or call us on 02 9545 2940.';
        btn.disabled = false; btn.textContent = 'Continue to secure payment';
      });
  });
})();
