/* Request form: tells the patient straight away whether their postcode is covered, and the fee. */
(function () {
  'use strict';
  var input = document.getElementById('b-postcode'), out = document.getElementById('b-coverage');
  if (!input || !out) return;
  var data = null;
  fetch('/assets/coverage.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !((d.metro && d.metro.length) || (d.regional && d.regional.length))) return;
    data = { metro: {}, regional: {}, metroFee: d.metroFee, regionalFee: d.regionalFee };
    d.metro.forEach(function (p) { data.metro[p] = 1; });
    d.regional.forEach(function (p) { data.regional[p] = 1; });
    check();
  }).catch(function () {});
  function check() {
    if (!data) return;
    var pc = input.value.replace(/\D/g, '');
    out.removeAttribute('data-state'); out.className = 'form-status';
    if (pc.length !== 4) { out.textContent = ''; return; }
    if (data.metro[pc]) { out.setAttribute('data-state', 'ok'); out.textContent = 'Home visits available in ' + pc + '. Metro home visit: ' + data.metroFee + '.'; }
    else if (data.regional[pc]) { out.setAttribute('data-state', 'ok'); out.textContent = 'Home visits available in ' + pc + '. Regional home visit: ' + data.regionalFee + '.'; }
    else { out.setAttribute('data-state', 'error'); out.textContent = 'We do not currently list ' + pc + ' for home visits. Send your request anyway and our team will check, or visit a partner collection centre.'; }
  }
  input.addEventListener('input', check);
})();
