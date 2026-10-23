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

  var pc = new URLSearchParams(location.search).get('postcode');
  var pcInput = document.getElementById('b-postcode');
  if (pc && pcInput) pcInput.value = pc.replace(/[^0-9]/g, '').slice(0, 4);


  // Request-form uploads: photos are resized and compressed in the browser so they fit the upload limit.
  var MAX_BYTES = 3 * 1024 * 1024;
  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
      fr.onerror = reject; fr.readAsDataURL(blob);
    });
  }
  function shrinkImage(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 2200 / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b || file); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function prepareFile(file) {
    if (!file) return Promise.resolve(null);
    var isImage = /^image\/(jpeg|png)$/.test(file.type);
    return (isImage && file.size > 1.2 * 1024 * 1024 ? shrinkImage(file) : Promise.resolve(file)).then(function (blob) {
      if (blob.size > MAX_BYTES) { var e = new Error('too large'); e.tooLarge = true; throw e; }
      var name = file.name || 'request-form';
      var type = blob.type || file.type || 'application/octet-stream';
      if (blob !== file && type === 'image/jpeg') name = name.replace(/\.\w+$/, '') + '.jpg';
      return toBase64(blob).then(function (b64) { return { fileName: name, contentType: type, content: b64 }; });
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('form[data-enquiry]'), function (form) {
    var status = form.querySelector('.form-status');
    var button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = { kind: form.getAttribute('data-enquiry'), page: location.pathname };
      var file = null;
      new FormData(form).forEach(function (v, k) {
        if (typeof v === 'object' && v && 'size' in v) { if (v.size) file = v; return; }
        data[k] = String(v);
      });
      var pay = form.getAttribute('data-enquiry') === 'booking' && window.ExpressBooking ? window.ExpressBooking.prepare(data) : null;
      button.disabled = true;
      status.removeAttribute('data-state');
      status.textContent = file ? 'Uploading your form…' : 'Sending…';
      prepareFile(file)
        .then(function (att) {
          if (att) data.attachment = att;
          return fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        })
        .then(function (r) {
          if (r.status === 413) { var e = new Error('too large'); e.tooLarge = true; throw e; }
          if (!r.ok) throw new Error(String(r.status));
        })
        .then(function () {
          if (pay) {
            status.setAttribute('data-state', 'ok');
            status.textContent = 'Request received. Taking you to secure payment…';
            if (typeof pay === 'string') { location.href = pay; return; }
            return fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pay.checkout) })
              .then(function (r) { return r.json(); })
              .then(function (j) {
                if (j && j.url) { location.href = j.url; return; }
                status.setAttribute('data-state', 'error');
                status.textContent = 'Your request has been received, but online payment could not start. Our team will contact you to arrange payment.';
                pay = null;
              });
          }
          form.reset();
          status.setAttribute('data-state', 'ok');
          status.textContent = form.getAttribute('data-enquiry') === 'booking' ? 'Thank you. Your request has been received and our team will contact you to confirm your appointment time.' : 'Thank you. Your message has been sent and our team will be in touch.';
        })
        .catch(function (err) {
          status.setAttribute('data-state', 'error');
          status.textContent = err && err.tooLarge
            ? 'That file is too large to send. Please upload a smaller photo or PDF (under 3 MB), or email it to us.'
            : 'Your message could not be sent. Please try again, or call or email us directly.';
        })
        .then(function () { if (!pay || status.getAttribute('data-state') === 'error') button.disabled = false; });
    });
  });
})();
