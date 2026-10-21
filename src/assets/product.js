/* Product page: collection option switches price and checkout link; mobile order bar. */
(function () {
  'use strict';
  var buy = document.getElementById('pp-buy'), price = document.getElementById('pp-price');
  var barBuy = document.getElementById('pp-bar-buy'), barPrice = document.getElementById('pp-bar-price');
  var bar = document.getElementById('pp-bar'), box = document.getElementById('pp-box');
  function select(r) {
    var href = r.getAttribute('data-href'), p = r.getAttribute('data-price');
    buy.href = href; price.textContent = p;
    if (barBuy) { barBuy.href = href; barPrice.textContent = p; }
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[name=pp-mode]'), function (r) {
    r.addEventListener('change', function () { if (r.checked) select(r); });
    if (r.checked) select(r);
  });
  if (bar && box && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      var show = !es[0].isIntersecting && es[0].boundingClientRect.top < 0;
      bar.classList.toggle('is-on', show); bar.setAttribute('aria-hidden', String(!show));
      if (barBuy) barBuy.tabIndex = show ? 0 : -1;
    }).observe(box);
  }
})();
