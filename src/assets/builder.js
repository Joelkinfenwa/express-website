/* Build-your-own-test: loads individual tests from Shopify (Storefront API),
   lets the patient pick tests and a collection method, then creates a Shopify
   cart and sends the patient to Shopify checkout. */
(function () {
  'use strict';
  var cfg = window.EXPRESS_SHOP || {};
  var $ = function (id) { return document.getElementById(id); };
  var grid = $('bt-grid'), catsEl = $('bt-cats'), search = $('bt-search');
  if (!grid) return;

  var fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  var CATEGORIES = [
    ['all', 'All tests'],
    ['general', 'General health'],
    ['heart', 'Heart and metabolic'],
    ['hormones', 'Hormones'],
    ['thyroid', 'Thyroid'],
    ['nutrients', 'Vitamins and iron'],
    ['sexual', 'Sexual health'],
    ['mens', "Men's health"]
  ];
  var LABELS = {}; CATEGORIES.forEach(function (c) { LABELS[c[0]] = c[1]; });
  // Keyword rules used when a product has no "category:<key>" tag in Shopify.
  var RULES = [
    ['thyroid', /thyroid|\btsh\b|\bt3\b|\bt4\b/i],
    ['sexual', /\bsti\b|chlamydia|gonorr|\bhiv\b|syphilis|hepatitis|herpes|sexual/i],
    ['mens', /\bpsa\b|prostate/i],
    ['hormones', /testosterone|oestradiol|estradiol|\bfsh\b|\blh\b|prolactin|progesterone|cortisol|dhea|igf|shbg|\bamh\b|hormone/i],
    ['nutrients', /vitamin|\bb12\b|folate|iron|ferritin|magnesium|zinc|copper|selenium|omega/i],
    ['heart', /cholesterol|lipid|glucose|hba1c|insulin|\bcrp\b|apolipo|apo ?b|lipoprotein|homocysteine|triglycer/i]
  ];

  var state = { tests: [], cat: 'all', q: '', picked: {}, mode: 'centre', busy: false };

  function categorise(p) {
    var tag = (p.tags || []).map(function (t) { return t.toLowerCase(); }).filter(function (t) { return t.indexOf('category:') === 0; })[0];
    if (tag && LABELS[tag.slice(9)]) return tag.slice(9);
    var text = [p.title, p.productType].concat(p.tags || []).join(' ');
    for (var i = 0; i < RULES.length; i++) if (RULES[i][1].test(text)) return RULES[i][0];
    return 'general';
  }

  function gql(query, variables) {
    var url = 'https://' + cfg.store + '/api/' + cfg.version + '/graphql.json';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': cfg.token },
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (r) {
      if (!r.ok) throw new Error('Shopify responded ' + r.status);
      return r.json();
    }).then(function (j) {
      if (j.errors && j.errors.length) throw new Error(j.errors[0].message);
      return j.data;
    });
  }

  var PRODUCTS_Q = 'query($handle:String!,$after:String){collection(handle:$handle){products(first:250,after:$after){pageInfo{hasNextPage endCursor}nodes{id title handle productType tags availableForSale variants(first:1){nodes{id availableForSale price{amount}}}}}}}';

  function loadAll(after, acc) {
    return gql(PRODUCTS_Q, { handle: cfg.collection, after: after || null }).then(function (d) {
      if (!d.collection) throw new Error('Collection "' + cfg.collection + '" was not found');
      var page = d.collection.products;
      acc = acc.concat(page.nodes);
      return page.pageInfo.hasNextPage ? loadAll(page.pageInfo.endCursor, acc) : acc;
    });
  }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function renderCats() {
    catsEl.textContent = '';
    var present = {}; state.tests.forEach(function (t) { present[t.cat] = true; });
    CATEGORIES.forEach(function (c) {
      if (c[0] !== 'all' && !present[c[0]]) return;
      catsEl.appendChild(el('button', {
        type: 'button', class: 'bt-cat', role: 'tab', 'aria-selected': String(state.cat === c[0]), text: c[1],
        onclick: function () { state.cat = c[0]; render(); }
      }));
    });
  }

  function renderGrid() {
    grid.textContent = '';
    var q = state.q.trim().toLowerCase();
    var shown = state.tests.filter(function (t) {
      return (state.cat === 'all' || t.cat === state.cat) && (!q || t.title.toLowerCase().indexOf(q) !== -1);
    });
    if (!shown.length) {
      grid.appendChild(el('div', { class: 'bt-empty', text: 'No tests match that search. Try another name, or contact us and we will check whether we can add it.' }));
      return;
    }
    shown.forEach(function (t) {
      var on = !!state.picked[t.id];
      grid.appendChild(el('button', {
        type: 'button', class: 'bt-item', 'aria-pressed': String(on),
        onclick: function () { toggle(t.id); }
      }, [
        el('span', { class: 'bt-box', 'aria-hidden': 'true' }),
        el('span', { class: 'bt-name' }, [el('strong', { text: t.title }), el('small', { text: LABELS[t.cat] })]),
        el('span', { class: 'bt-price', text: fmt.format(t.price) })
      ]));
    });
  }

  function renderSummary() {
    var sel = state.tests.filter(function (t) { return state.picked[t.id]; });
    var subtotal = sel.reduce(function (a, t) { return a + t.price; }, 0);
    var list = $('bt-sel'); list.textContent = '';
    sel.forEach(function (t) {
      list.appendChild(el('li', {}, [
        el('span', { text: t.title }),
        el('span', { style: 'display:flex;align-items:center;gap:10px' }, [
          el('span', { style: 'font-weight:600', text: fmt.format(t.price) }),
          el('button', { type: 'button', class: 'bt-remove', 'aria-label': 'Remove ' + t.title, text: '×', onclick: function () { toggle(t.id); } })
        ])
      ]));
    });
    var home = state.mode === 'home';
    $('bt-empty').hidden = sel.length > 0;
    $('bt-count').textContent = sel.length === 1 ? '1 test' : sel.length + ' tests';
    $('bt-subtotal').textContent = fmt.format(subtotal);
    $('bt-collection').textContent = home ? (cfg.homeVisitLabel || 'Home visit') : 'Included';
    $('bt-total').textContent = home && homeVisitPrice != null ? fmt.format(subtotal + homeVisitPrice)
      : home ? fmt.format(subtotal) + ' + visit' : fmt.format(subtotal);
    $('bt-nudge').style.display = subtotal >= 200 ? 'block' : 'none';
    $('bt-checkout').disabled = sel.length === 0 || state.busy;
    $('bt-checkout').textContent = state.busy ? 'Opening checkout…' : 'Continue to checkout';
    Array.prototype.forEach.call(document.querySelectorAll('.bt-mode'), function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-mode') === state.mode));
    });
  }

  function render() { renderCats(); renderGrid(); renderSummary(); }

  function toggle(id) {
    if (state.picked[id]) delete state.picked[id]; else state.picked[id] = true;
    render();
  }

  function status(msg, kind) {
    var s = $('bt-status'); s.textContent = msg || ''; if (kind) s.setAttribute('data-state', kind); else s.removeAttribute('data-state');
  }

  var homeVisitPrice = null;

  function checkout() {
    var ids = Object.keys(state.picked);
    if (!ids.length || state.busy) return;
    state.busy = true; status(''); renderSummary();
    var lines = ids.map(function (id) { return { merchandiseId: id, quantity: 1 }; });
    var home = state.mode === 'home';
    if (home && cfg.homeVisitVariant) lines.push({ merchandiseId: cfg.homeVisitVariant, quantity: 1 });
    var input = {
      lines: lines,
      attributes: [{ key: 'Collection method', value: home ? 'Nurse home visit' : 'Walk-in collection centre' }, { key: 'Source', value: 'Build your own test' }]
    };
    gql('mutation($input:CartInput!){cartCreate(input:$input){cart{checkoutUrl}userErrors{message}}}', { input: input })
      .then(function (d) {
        var res = d.cartCreate;
        if (res.userErrors && res.userErrors.length) throw new Error(res.userErrors[0].message);
        window.location.href = res.cart.checkoutUrl;
      })
      .catch(function () {
        state.busy = false; renderSummary();
        status('We could not open checkout just now. Please try again, or contact us.', 'error');
      });
  }

  function fallback() {
    grid.textContent = '';
    var box = el('div', { class: 'bt-empty' }, [
      el('span', { text: 'The test builder is temporarily unavailable. ' }),
      el('a', { href: cfg.shopUrl + '/collections/' + cfg.collection, style: 'font-weight:700;text-decoration:underline', text: 'Browse individual tests' })
    ]);
    grid.appendChild(box);
  }

  // Events
  search.addEventListener('input', function () { state.q = search.value; renderGrid(); });
  Array.prototype.forEach.call(document.querySelectorAll('.bt-mode'), function (b) {
    b.addEventListener('click', function () { state.mode = b.getAttribute('data-mode'); renderSummary(); });
  });
  $('bt-checkout').addEventListener('click', checkout);

  // Preview mode: Shopify not connected yet. Sample tests so the page can be tried; checkout stays off.
  if (!cfg.store || !cfg.token || !cfg.collection) {
    var SAMPLE = [['Full blood count',25],['Liver function',25],['Kidney function',25],['Cholesterol and lipids',25],['HbA1c',30],['C-reactive protein',29],
      ['Testosterone',39],['SHBG and free testosterone',39],['Oestradiol',39],['Cortisol',35],['TSH',25],['Free T4',25],
      ['Vitamin D',45],['Vitamin B12',35],['Iron studies and ferritin',39],['PSA',39]];
    state.tests = SAMPLE.map(function (r, i) { return { id: 'sample-' + i, title: r[0], price: r[1], cat: categorise({ title: r[0], tags: [] }) }; });
    var note = document.createElement('p');
    note.setAttribute('style', 'margin:0;padding:12px 16px;border-radius:14px;background:#FBEDE4;font-size:14px;font-weight:600');
    note.textContent = 'Preview mode: sample tests and prices. Live tests and checkout appear once Shopify is connected.';
    catsEl.parentNode.insertBefore(note, catsEl);
    $('bt-checkout').removeEventListener('click', checkout);
    $('bt-checkout').addEventListener('click', function () { status('Checkout is switched off in preview mode until Shopify is connected.', 'error'); });
    render();
    return;
  }
  var loads = [loadAll(null, [])];
  if (cfg.homeVisitVariant) {
    loads.push(gql('query($id:ID!){node(id:$id){... on ProductVariant{price{amount}}}}', { id: cfg.homeVisitVariant })
      .then(function (d) { if (d.node) homeVisitPrice = parseFloat(d.node.price.amount); }).catch(function () {}));
  }
  Promise.all(loads).then(function (r) {
    state.tests = r[0].filter(function (p) {
      var v = p.variants.nodes[0];
      return p.availableForSale && v && v.availableForSale;
    }).map(function (p) {
      var v = p.variants.nodes[0];
      return { id: v.id, title: p.title, price: parseFloat(v.price.amount), cat: categorise(p) };
    }).sort(function (a, b) { return a.title.localeCompare(b.title); });
    if (homeVisitPrice != null) $('bt-home-note').textContent = '+ ' + fmt.format(homeVisitPrice);
    if (!state.tests.length) { fallback(); return; }
    render();
  }).catch(fallback);
})();
