/* Request form: postcode coverage and fee, and payment upfront through Shopify checkout
   for home visits with the patient's own doctor's request form. */
(function () {
  'use strict';
  var form = document.querySelector('form[data-enquiry="booking"]');
  var input = document.getElementById('b-postcode'), out = document.getElementById('b-coverage');
  var button = document.getElementById('b-submit'), note = document.getElementById('b-pay-note');
  var file = document.getElementById('b-file');
  if (!form || !input || !out) return;
  var data = null;

  function area(pc) { return !data ? null : data.metro[pc] ? 'metro' : data.regional[pc] ? 'regional' : null; }
  function referral() { var r = form.querySelector('input[name="has_referral"]:checked'); return r ? r.value : ''; }
  function variantFor(a) { return data && data.ownForm && a ? data.ownForm[a] : null; }

  function update() {
    var pc = input.value.replace(/\D/g, '');
    out.removeAttribute('data-state'); out.className = 'form-status';
    if (!data || pc.length !== 4) out.textContent = '';
    else if (data.metro[pc]) { out.setAttribute('data-state', 'ok'); out.textContent = 'Home visits available in ' + pc + '. Metro home visit: ' + data.metroFee + '.'; }
    else if (data.regional[pc]) { out.setAttribute('data-state', 'ok'); out.textContent = 'Home visits available in ' + pc + '. Regional home visit: ' + data.regionalFee + '.'; }
    else { out.setAttribute('data-state', 'error'); out.textContent = 'We do not currently list ' + pc + ' for home visits. Send your request anyway and our team will check, or visit a partner collection centre.'; }

    var hasForm = referral() === 'Yes';
    if (file) file.required = hasForm;
    var a = pc.length === 4 ? area(pc) : null, v = hasForm ? variantFor(a) : null;
    if (button) button.textContent = v ? 'Continue to payment' : 'Request my home visit';
    if (note) {
      if (v) { note.hidden = false; note.textContent = 'Next, you will pay the ' + (a === 'metro' ? data.metroFee + ' metro' : data.regionalFee + ' regional') + ' home visit fee at our secure checkout. ' + 'Your request and form are sent to our team at the same time.'; }
      else if (hasForm && a) { note.hidden = false; note.textContent = 'Our team will contact you to confirm your appointment and arrange payment.'; }
      else note.hidden = true;
    }
  }

  // Called by the form handler just before sending. Adds a reference and returns the checkout URL, or null.
  window.ExpressBooking = {
    prepare: function (d) {
      var a = area(String(d.postcode || '').replace(/\D/g, ''));
      var v = d.has_referral === 'Yes' ? variantFor(a) : null;
      d.reference = 'EP-' + Date.now().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
      if (!v) { d.payment = 'Not taken online, team to arrange'; return null; }
      d.payment = 'Sent to Shopify checkout, ' + (a === 'metro' ? 'metro ' + data.metroFee : 'regional ' + data.regionalFee) + '. Match the order by reference.';
      var attrs = { 'Booking reference': d.reference, 'Collection method': 'Nurse home visit (own request form)', 'Patient name': d.name, 'Suburb': d.suburb, 'Postcode': d.postcode, 'Preferred date': d.preferred_date, 'Preferred time': d.preferred_time };
      var q = ['checkout[email]=' + encodeURIComponent(d.email || '')];
      Object.keys(attrs).forEach(function (k) { if (attrs[k]) q.push('attributes[' + encodeURIComponent(k) + ']=' + encodeURIComponent(attrs[k])); });
      return 'https://' + data.store + '/cart/' + v.id + ':1?' + q.join('&');
    }
  };

  fetch('/assets/coverage.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !((d.metro && d.metro.length) || (d.regional && d.regional.length))) return;
    data = { metro: {}, regional: {}, metroFee: d.metroFee, regionalFee: d.regionalFee, store: d.store, ownForm: d.ownForm };
    d.metro.forEach(function (p) { data.metro[p] = 1; });
    d.regional.forEach(function (p) { data.regional[p] = 1; });
    update();
  }).catch(function () {});
  input.addEventListener('input', update);
  Array.prototype.forEach.call(form.querySelectorAll('input[name="has_referral"]'), function (r) { r.addEventListener('change', update); });
})();
