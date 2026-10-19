/* Shared behaviour: mobile menu and enquiry forms. */
(function () {
  'use strict';
  var toggle = document.querySelector('.nav-toggle');
  var links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('form[data-enquiry]'), function (form) {
    var status = form.querySelector('.form-status');
    var button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = { kind: form.getAttribute('data-enquiry'), page: location.pathname };
      new FormData(form).forEach(function (v, k) { data[k] = String(v); });
      button.disabled = true;
      status.removeAttribute('data-state');
      status.textContent = 'Sending…';
      fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(String(r.status)); })
        .then(function () {
          form.reset();
          status.setAttribute('data-state', 'ok');
          status.textContent = 'Thank you. Your message has been sent and our team will be in touch.';
        })
        .catch(function () {
          status.setAttribute('data-state', 'error');
          status.textContent = 'Your message could not be sent. Please try again, or email us directly.';
        })
        .then(function () { button.disabled = false; });
    });
  });
})();
