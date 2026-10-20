/* Live home visit booking against Doorstep (through the site's /api/doorstep/* functions).
   Falls back to the request form when live booking is not connected. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var live = $('live-mode'), request = $('request-mode');
  if (!live || !request) return;

  var DAYS_AHEAD = 14;
  var state = { postcode: '', tz: 'Australia/Sydney', tzLabel: 'Sydney time', days: [], slotsByDay: {}, day: null, slot: null, key: null, busy: false };

  // Patient-local time zone from the postcode (Australian postcode ranges).
  function zoneFor(pc) {
    var n = parseInt(pc, 10), f = pc.charAt(0);
    if (f === '0' && n >= 800 && n <= 999) return ['Australia/Darwin', 'Darwin time', 'NT'];
    if ((n >= 200 && n <= 299) || (n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920)) return ['Australia/Sydney', 'Canberra time', 'ACT'];
    if (n >= 2880 && n <= 2880) return ['Australia/Broken_Hill', 'Broken Hill time', 'NSW'];
    if (f === '2' || f === '1') return ['Australia/Sydney', 'Sydney time', 'NSW'];
    if (f === '3' || f === '8') return ['Australia/Melbourne', 'Melbourne time', 'VIC'];
    if (f === '4' || f === '9') return ['Australia/Brisbane', 'Brisbane time', 'QLD'];
    if (f === '5') return ['Australia/Adelaide', 'Adelaide time', 'SA'];
    if (f === '6') return ['Australia/Perth', 'Perth time', 'WA'];
    if (f === '7') return ['Australia/Hobart', 'Hobart time', 'TAS'];
    return ['Australia/Sydney', 'Sydney time', 'NSW'];
  }

  function ymdIn(tz, date) { // YYYY-MM-DD for a Date in a time zone
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    var g = function (t) { return p.filter(function (x) { return x.type === t; })[0].value; };
    return g('year') + '-' + g('month') + '-' + g('day');
  }
  function fmt(date, opts) { return new Intl.DateTimeFormat('en-AU', Object.assign({ timeZone: state.tz }, opts)).format(date); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function setStatus(id, msg, kind) {
    var s = $(id); s.textContent = msg || '';
    if (kind) s.setAttribute('data-state', kind); else s.removeAttribute('data-state');
  }
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j.error && j.error.message) || 'Request failed'); e.code = j.error && j.error.code; e.field = j.error && j.error.field; e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]);
    });
    if (text != null) n.textContent = text;
    return n;
  }

  // ---- Step 1: postcode ----
  function checkPostcode(e) {
    if (e) e.preventDefault();
    var pc = $('lb-postcode').value.replace(/\D/g, '').slice(0, 4);
    $('lb-postcode').value = pc;
    if (pc.length !== 4) { setStatus('lb-pc-status', 'Enter a 4-digit postcode.', 'error'); return; }
    setStatus('lb-pc-status', 'Checking coverage…');
    $('lb-step2').hidden = true; $('lb-step3').hidden = true;
    api('/api/doorstep/coverage?postcode=' + pc).then(function (c) {
      if (!c.supported) {
        setStatus('lb-pc-status', '');
        var s = $('lb-pc-status');
        s.setAttribute('data-state', 'error');
        s.textContent = 'We do not yet offer home visits in ' + pc + '. ';
        s.appendChild(el('a', { href: '/tests', style: 'text-decoration: underline' }, 'Order a test and visit a partner centre'));
        s.appendChild(document.createTextNode(', or '));
        s.appendChild(el('a', { href: '#request-mode', style: 'text-decoration: underline', onclick: showRequest }, 'send us a request'));
        s.appendChild(document.createTextNode('.'));
        $('lb-sum-loc').textContent = pc + ' · not covered';
        return;
      }
      var z = zoneFor(pc);
      state.postcode = pc; state.tz = z[0]; state.tzLabel = z[1];
      $('lb-pc2').value = pc; $('lb-state').value = z[2];
      $('lb-sum-loc').textContent = pc + ' · home visits available';
      setStatus('lb-pc-status', 'Home visits are available in ' + pc + '.', 'ok');
      loadSlots();
    }).catch(function () { setStatus('lb-pc-status', 'We could not check coverage just now. Please try again, or call us.', 'error'); });
  }

  // ---- Step 2: availability ----
  function loadSlots() {
    var now = new Date();
    var from = ymdIn('Australia/Sydney', now);
    var to = ymdIn('Australia/Sydney', new Date(now.getTime() + (DAYS_AHEAD - 1) * 86400000));
    $('lb-step2').hidden = false;
    $('lb-tz').textContent = 'Times shown in ' + state.tzLabel + '.';
    $('lb-days').textContent = ''; $('lb-slots').textContent = '';
    setStatus('lb-slot-status', 'Loading available times…');
    api('/api/doorstep/availability?postcode=' + state.postcode + '&from=' + from + '&to=' + to).then(function (r) {
      state.slotsByDay = {}; state.days = [];
      (r.slots || []).forEach(function (s) {
        var d = new Date(s.startsAt);
        if (d.getTime() < Date.now()) return;
        var key = ymdIn(state.tz, d);
        if (!state.slotsByDay[key]) { state.slotsByDay[key] = []; state.days.push(key); }
        state.slotsByDay[key].push({ startsAt: s.startsAt, date: d, mins: s.durationMins });
      });
      state.days.sort();
      if (!state.days.length) { setStatus('lb-slot-status', 'There are no available times in the next two weeks. Please call us and we will find a time.', 'error'); return; }
      setStatus('lb-slot-status', '');
      state.day = state.days[0];
      renderDays(); renderSlots();
    }).catch(function () { setStatus('lb-slot-status', 'We could not load available times. Please try again, or call us.', 'error'); });
  }

  function renderDays() {
    var box = $('lb-days'); box.textContent = '';
    state.days.forEach(function (key) {
      var first = state.slotsByDay[key][0].date;
      var on = key === state.day;
      var b = el('button', {
        type: 'button', role: 'tab', 'aria-selected': String(on),
        style: 'flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 86px; padding: 12px 14px; border-radius: 18px; font: inherit; cursor: pointer; ' + (on ? 'background: #17302A; color: #F7F4EF; border: 1px solid #17302A' : 'background: #FFFFFF; color: #1C2420; border: 1px solid #D3D8D0'),
        onclick: function () { state.day = key; renderDays(); renderSlots(); }
      });
      b.appendChild(el('span', { style: 'font-size: 13px; font-weight: 600' }, fmt(first, { weekday: 'short' })));
      b.appendChild(el('span', { style: "font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 20px" }, fmt(first, { day: 'numeric', month: 'short' })));
      box.appendChild(b);
    });
  }

  function renderSlots() {
    var box = $('lb-slots'); box.textContent = '';
    (state.slotsByDay[state.day] || []).forEach(function (s) {
      var on = state.slot && state.slot.startsAt === s.startsAt;
      box.appendChild(el('button', {
        type: 'button', 'aria-pressed': String(on),
        style: 'min-height: 50px; border-radius: 999px; font: inherit; font-weight: 700; cursor: pointer; ' + (on ? 'background: #F2A981; color: #1C2420; border: 1px solid #F2A981' : 'background: #FFFFFF; color: #1C2420; border: 1px solid #D3D8D0'),
        onclick: function () { pickSlot(s); }
      }, fmt(s.date, { hour: 'numeric', minute: '2-digit' })));
    });
  }

  function pickSlot(s) {
    state.slot = s; state.key = uuid(); // new attempt key for each chosen slot
    renderSlots();
    $('lb-sum-time').textContent = fmt(s.date, { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + fmt(s.date, { hour: 'numeric', minute: '2-digit' });
    $('lb-step3').hidden = false;
    $('lb-first').focus({ preventScroll: true });
    $('lb-step3').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Step 3: details and booking ----
  document.querySelectorAll('input[name="hasReferral"]').forEach(function (r) {
    r.addEventListener('change', function () { $('lb-upload').hidden = r.value === 'no' && r.checked; });
  });

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  function submit(e) {
    e.preventDefault();
    var form = $('lb-step3');
    if (state.busy) return;
    if (!state.slot) { setStatus('lb-book-status', 'Choose a time first.', 'error'); return; }
    if (!form.reportValidity()) return;
    var f = new FormData(form);
    var file = $('lb-file').files[0];
    if (file && file.size > 3.5 * 1024 * 1024) { setStatus('lb-book-status', 'The request form file is too large. Please upload a file under 3.5 MB, or hand it to your nurse on the day.', 'error'); return; }
    var payload = {
      idempotencyKey: state.key,
      startsAt: state.slot.startsAt,
      firstName: f.get('firstName'), lastName: f.get('lastName'), email: f.get('email'), mobile: f.get('mobile'),
      dateOfBirth: f.get('dateOfBirth') || '',
      line1: f.get('line1'), suburb: f.get('suburb'), state: f.get('state'), postcode: state.postcode,
      hasReferral: f.get('hasReferral'), fastingRequired: f.get('fastingRequired') === 'on', notes: f.get('notes') || '',
      company_website: f.get('company_website') || ''
    };
    state.busy = true; $('lb-submit').disabled = true; $('lb-submit').textContent = 'Booking…';
    setStatus('lb-book-status', '');
    var ready = file && f.get('hasReferral') !== 'no'
      ? readFile(file).then(function (b64) { payload.referral = { fileName: file.name, contentType: file.type, content: b64 }; })
      : Promise.resolve();
    ready.then(function () {
      return api('/api/doorstep/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }).then(function (r) {
      done(r, payload);
    }).catch(function (err) {
      state.busy = false; $('lb-submit').disabled = false; $('lb-submit').textContent = 'Confirm booking';
      if (err.code === 'SLOT_UNAVAILABLE') {
        setStatus('lb-book-status', 'That time has just been taken. Please choose another time.', 'error');
        state.slot = null; $('lb-sum-time').textContent = 'Not selected'; loadSlots();
        $('lb-step2').scrollIntoView({ behavior: 'smooth' });
      } else if (err.code === 'VALIDATION') {
        setStatus('lb-book-status', err.message, 'error');
        var map = { firstName: 'lb-first', lastName: 'lb-last', email: 'lb-email', mobile: 'lb-mobile', dateOfBirth: 'lb-dob', line1: 'lb-line1', suburb: 'lb-suburb', state: 'lb-state', referral: 'lb-file' };
        if (map[err.field]) $(map[err.field]).focus();
      } else {
        setStatus('lb-book-status', 'We could not complete your booking. Please try again, or call us on the number shown.', 'error');
      }
    });
  }

  function done(r, payload) {
    var d = new Date(r.startsAt || payload.startsAt);
    ['lb-step1', 'lb-step2', 'lb-step3'].forEach(function (id) { $(id).hidden = true; });
    $('lb-done').hidden = false;
    $('lb-done-line').textContent = 'A registered nurse will arrive ' + fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }) + ' at ' + fmt(d, { hour: 'numeric', minute: '2-digit' }) + ' (' + state.tzLabel + ') at ' + payload.line1 + ', ' + payload.suburb + '.';
    $('lb-done-ref').textContent = r.reference || String(r.id).slice(0, 8).toUpperCase();
    $('lb-done-referral').textContent = r.referralAttached === true ? 'We have received your request form.'
      : r.referralAttached === false ? 'We could not attach your request form. Please have it ready for your nurse on the day.'
      : payload.hasReferral === 'no' ? 'You told us you do not have a request form yet. You can order a test online, and our team will be in touch if anything else is needed.'
      : 'Please have your request form ready for your nurse on the day.';
    $('lb-done-title').focus();
    live.scrollIntoView({ behavior: 'smooth' });
    if (window.gtag) window.gtag('event', 'home_visit_booked');
    if (window.fbq) window.fbq('track', 'Schedule');
  }

  function showRequest(e) {
    if (e) e.preventDefault();
    request.hidden = false;
    var pc = $('b-postcode'); if (pc && state.postcode) pc.value = state.postcode;
    request.scrollIntoView({ behavior: 'smooth' });
  }

  // ---- Start ----
  api('/api/doorstep/status').then(function (s) {
    if (!s.live) return; // keep the request form
    request.hidden = true; live.hidden = false;
    if (s.environment === 'sandbox') $('lb-sandbox').hidden = false;
    $('lb-pc-form').addEventListener('submit', checkPostcode);
    $('lb-step3').addEventListener('submit', submit);
    var pc = new URLSearchParams(location.search).get('postcode');
    if (pc) { $('lb-postcode').value = pc.replace(/\D/g, '').slice(0, 4); checkPostcode(); }
  }).catch(function () { /* status unavailable: request form stays */ });
})();
