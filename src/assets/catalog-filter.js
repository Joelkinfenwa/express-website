/* Filters the "All tests" list by health area and search text. */
(function () {
  'use strict';
  var rows = Array.prototype.slice.call(document.querySelectorAll('.cat-row'));
  var buttons = Array.prototype.slice.call(document.querySelectorAll('#cat-filters [data-cat]'));
  var search = document.getElementById('cat-search');
  var count = document.getElementById('cat-count');
  var empty = document.getElementById('cat-empty');
  if (!rows.length) return;
  var state = { cat: 'all', q: '' };

  function apply() {
    var q = state.q.trim().toLowerCase(), shown = 0;
    rows.forEach(function (r) {
      var okCat = state.cat === 'all' || (' ' + r.getAttribute('data-cats') + ' ').indexOf(' ' + state.cat + ' ') !== -1;
      var okQ = !q || r.getAttribute('data-search').indexOf(q) !== -1;
      r.hidden = !(okCat && okQ);
      if (!r.hidden) shown++;
    });
    count.textContent = shown === 1 ? 'Showing 1 test' : 'Showing ' + shown + ' tests';
    empty.hidden = shown > 0;
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      state.cat = b.getAttribute('data-cat');
      buttons.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      apply();
    });
  });
  if (search) search.addEventListener('input', function () { state.q = search.value; apply(); });
  apply();
})();
