/* @ds-bundle: {"format":4,"namespace":"iCommerce","components":[{"name":"AddToCartButton"},{"name":"CheckoutButton"},{"name":"ShipButton"}]} */
/* iCommerce motion helpers. Plain DOM + Web Animations API, no deps.
   Every helper: action already happened (optimistic), animation = feedback only, never blocks input.
   prefers-reduced-motion → no travel, just a short fade/pulse. */
(function () {
  var EASE = 'cubic-bezier(.25,1,.5,1)';          // ease-out-quart
  var EASE_IO = 'cubic-bezier(.65,0,.35,1)';      // ease-in-out (travel)
  var reduced = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var center = function (r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  function bump(el) {
    if (!el) return;
    el.animate(reduced()
      ? [{ opacity: 1 }, { opacity: .4 }, { opacity: 1 }]
      : [{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: EASE });
  }

  function incCount(el, by) {
    if (!el) return;
    el.textContent = String((parseInt(el.textContent, 10) || 0) + (by || 1));
    el.hidden = false;
    bump(el);
  }

  /* Fly a visual copy of `fromEl` to `toEl`. Arc: x eases in-out, y eases out (rises fast, settles) → curved path.
     Returns a Promise resolved on landing. */
  function fly(fromEl, toEl, o) {
    o = o || {};
    var a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    if (reduced() || !a.width) return Promise.resolve();
    var ca = center(a), cb = center(b);
    var outer = document.createElement('div'), inner = document.createElement('div');
    outer.style.cssText = 'position:fixed;left:' + a.left + 'px;top:' + a.top + 'px;width:' + a.width + 'px;height:' + a.height +
      'px;pointer-events:none;z-index:var(--z-toast,500)';
    inner.style.cssText = 'width:100%;height:100%;overflow:hidden;border-radius:var(--radius-lg);box-shadow:var(--shadow-2)';
    var ghost = fromEl.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    inner.appendChild(ghost); outer.appendChild(inner); document.body.appendChild(outer);
    var d = o.duration || 700, delay = o.delay || 0, end = o.scale || .16;
    outer.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (cb.x - ca.x) + 'px)' }],
      { duration: d, delay: delay, easing: EASE_IO, fill: 'both' });
    var anim = inner.animate([
      { transform: 'translateY(0) scale(1)', opacity: 1, borderRadius: '10px' },
      { transform: 'translateY(' + (cb.y - ca.y) * .35 + 'px) scale(.55)', opacity: 1, offset: .45 },
      { transform: 'translateY(' + (cb.y - ca.y) + 'px) scale(' + end + ')', opacity: .7, borderRadius: '50%' }
    ], { duration: d, delay: delay, easing: o.easingY || 'cubic-bezier(.3,0,.2,1)', fill: 'both' });
    return anim.finished.then(function () { outer.remove(); });
  }

  function swapLabel(btn, html, state) {
    var label = btn.querySelector('.ic-mbtn__label');
    if (!label) return;
    label.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: EASE }).finished.then(function () {
      label.innerHTML = html;
      if (state) btn.setAttribute('data-state', state);
      label.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE });
    });
  }

  var CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  /* 1. Add to cart: product image → cart icon. */
  function addToCart(btn, opts) {
    opts = opts || {};
    if (btn.getAttribute('data-state') === 'busy') return Promise.resolve();
    var img = opts.image, cart = opts.cart, count = opts.count;
    var idle = btn.querySelector('.ic-mbtn__label').innerHTML;
    btn.setAttribute('data-state', 'busy');
    btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 160, easing: EASE });
    return fly(img, cart).then(function () {
      bump(cart); incCount(count, opts.qty || 1);
      swapLabel(btn, CHECK + '<span>' + (opts.doneText || 'Added') + '</span>', 'done');
      setTimeout(function () { swapLabel(btn, idle, 'idle'); }, opts.resetAfter || 1600);
    });
  }

  /* 2. Checkout: cart items drop into the box on the button, flaps close, tape seals. */
  function checkout(btn, opts) {
    opts = opts || {};
    if (btn.getAttribute('data-state') === 'busy') return Promise.resolve();
    var box = btn.querySelector('.ic-box'), items = opts.items || [];
    btn.setAttribute('data-state', 'busy');
    swapLabel(btn, '<span>' + (opts.packingText || 'Packing your order') + '</span>', 'busy');
    box.classList.remove('is-closed');
    var drops = items.map(function (el, i) {
      return fly(el, box, { duration: 560, delay: i * 90, scale: .14, easingY: 'cubic-bezier(.5,0,.75,0)' })
        .then(function () { bump(box); });
    });
    return Promise.all(drops).then(function () {
      box.classList.add('is-closed');
      return new Promise(function (r) { setTimeout(r, reduced() ? 0 : 420); });
    }).then(function () {
      swapLabel(btn, CHECK + '<span>' + (opts.doneText || 'Order packed') + '</span>', 'done');
      if (opts.onDone) setTimeout(opts.onDone, 500);
    });
  }

  /* 3. Ship: truck drives across the button (reading direction: LTR left→right, RTL mirrored). */
  function ship(btn, opts) {
    opts = opts || {};
    if (btn.getAttribute('data-state') === 'busy' || btn.getAttribute('data-state') === 'done') return Promise.resolve();
    var truck = btn.querySelector('.ic-truck'), road = btn.querySelector('.ic-road');
    var rtl = getComputedStyle(btn).direction === 'rtl', w = btn.getBoundingClientRect().width;
    btn.setAttribute('data-state', 'busy');
    swapLabel(btn, '<span>' + (opts.busyText || 'On the way') + '</span>', 'busy');
    if (reduced()) {
      swapLabel(btn, CHECK + '<span>' + (opts.doneText || 'Shipped') + '</span>', 'done');
      return Promise.resolve();
    }
    var from = rtl ? w + 8 : -48, to = rtl ? -48 : w + 8, flip = rtl ? ' scaleX(-1)' : '';
    road.animate([{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .85 }, { opacity: 0 }],
      { duration: 1300, easing: 'linear', fill: 'both' });
    road.animate([{ backgroundPositionX: '0px' }, { backgroundPositionX: (rtl ? 64 : -64) + 'px' }],
      { duration: 1300, easing: 'linear' });
    truck.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-1px)' }, { transform: 'translateY(0)' }],
      { duration: 160, iterations: 8 });
    return truck.animate([
      { transform: 'translateX(' + from + 'px)' + flip },
      { transform: 'translateX(' + (w / 2 - 20) + 'px)' + flip, offset: .5 },
      { transform: 'translateX(' + to + 'px)' + flip }
    ], { duration: 1300, easing: EASE_IO, fill: 'none' }).finished.then(function () {
      swapLabel(btn, CHECK + '<span>' + (opts.doneText || 'Shipped') + '</span>', 'done');
      if (opts.onDone) opts.onDone();
    });
  }

  window.iCommerce = { fly: fly, bump: bump, addToCart: addToCart, checkout: checkout, ship: ship,
    AddToCartButton: addToCart, CheckoutButton: checkout, ShipButton: ship };
})();
