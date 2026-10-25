/* Request form: postcode coverage and fee. Payment is always taken online: with a doctor's
   request form the visit fee goes to Stripe checkout; without one the patient chooses tests next. */
(function () {
  'use strict';
  var form = document.querySelector('form[data-enquiry="booking"]');
  var input = document.getElementById('b-postcode'), out = document.getElementById('b-coverage');
  var button = document.getElementById('b-submit'), note = document.getElementById('b-pay-note');
  var file = document.getElementById('b-file');
  if (!form || !input || !out) return;
  var data = null;

  function area(pc) { return !data ? null : data.metro[pc] ? 'metro' : data.regional[pc] ? 'regional' : null; }
  // Fee band for any postcode: listed area first, otherwise national metro list, otherwise regional
  function band(pc) { return !data || pc.length !== 4 ? null : area(pc) || (data.metroAll[pc] ? 'metro' : 'regional'); }
  function referral() { var r = form.querySelector('input[name="has_referral"]:checked'); return r ? r.value : ''; }
  function variantFor(a) { return data && a ? true : null; }

  function update() {
    var pc = input.value.replace(/\D/g, '');
    out.removeAttribute('data-state'); out.className = 'form-status';
    if (!data || pc.length !== 4) out.textContent = '';
    else if (data.metro[pc]) { out.setAttribute('data-state', 'ok'); out.textContent = 'Home visits available in ' + pc + '. Metro home visit: ' + data.metroFee + '.'; }
    else if (data.regional[pc]) { out.setAttribute('data-state', 'ok'); out.textContent = 'Home visits available in ' + pc + '. Regional home visit: ' + data.regionalFee + '.'; }
    else { out.setAttribute('data-state', 'ok'); out.textContent = 'Home visit: ' + (band(pc) === 'metro' ? data.metroFee + ' metro' : data.regionalFee + ' regional') + '. Our team will confirm your nurse after booking, and if we cannot arrange a visit we will refund you in full.'; }

    var hasForm = referral() === 'Yes';
    if (file) file.required = hasForm;
    var a = band(pc), v = hasForm ? variantFor(a) : null, noForm = referral() === 'No';
    if (button) button.textContent = v ? 'Continue to payment' : noForm ? 'Continue to choose your tests' : 'Request my home visit';
    if (note) {
      if (v) { note.hidden = false; note.textContent = 'Next, you will pay the ' + (a === 'metro' ? data.metroFee + ' metro' : data.regionalFee + ' regional') + ' home visit fee at our secure checkout. ' + 'Your request and form are sent to our team at the same time.'; }
      else if (noForm) { note.hidden = false; note.textContent = 'Next, choose your tests and select Home visit at checkout. You pay online and a registered nurse comes to you.'; }
      else note.hidden = true;
    }
  }

  // Called by the form handler just before sending. Adds a reference and returns the checkout URL, or null.
  window.ExpressBooking = {
    prepare: function (d) {
      var pc = String(d.postcode || '').replace(/\D/g, ''), a = band(pc);
      var v = d.has_referral === 'Yes' && a ? true : null;
      d.reference = 'EP-' + Date.now().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
      if (d.has_referral === 'No') { d.payment = 'No doctor\'s form: sent to choose tests and pay online. A paid-order email follows if they complete checkout.'; return '/tests'; }
      if (!v) { d.payment = 'Not taken online, team to arrange'; return null; }
      d.payment = 'Sent to online payment (Stripe), ' + (a === 'metro' ? 'metro ' + data.metroFee : 'regional ' + data.regionalFee) + '. A separate paid-order email with the same reference confirms payment.' + (area(pc) ? '' : ' Outside listed area: confirm nurse.');
      var parts = String(d.name || '').trim().split(/\s+/);
      return { checkout: { type: 'own-form', reference: d.reference, preferredDate: d.preferred_date, preferredTime: d.preferred_time, notes: d.message,
        patient: { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || parts[0] || '', email: d.email, phone: d.phone, suburb: d.suburb, postcode: d.postcode } } };
    }
  };

  fetch('/assets/coverage.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !((d.metro && d.metro.length) || (d.regional && d.regional.length))) return;
    data = { metro: {}, regional: {}, metroAll: {}, metroFee: d.metroFee, regionalFee: d.regionalFee, store: d.store, ownForm: d.ownForm };
    d.metro.forEach(function (p) { data.metro[p] = 1; });
    d.regional.forEach(function (p) { data.regional[p] = 1; });
    (d.metroAll || []).forEach(function (p) { data.metroAll[p] = 1; });
    update();
  }).catch(function () {});
  input.addEventListener('input', update);
  Array.prototype.forEach.call(form.querySelectorAll('input[name="has_referral"]'), function (r) { r.addEventListener('change', update); });
})();
