// PeekRating from React Bits (reactbits.dev), ported to plain JS for this static site.
// Usage: PeekRating(containerEl, { defaultValue: 0, onChange: v => {} }) -> { setValue, getValue, destroy }
(function () {
  var EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SHAPES = {
    star: 'M13.728 3.444l1.76 3.549c.24.494.88.968 1.42 1.058l3.19.535c2.04.343 2.52 1.835 1.05 3.307l-2.48 2.5c-.42.423-.65 1.24-.52 1.825l.71 3.094c.56 2.45-.73 3.398-2.88 2.118l-2.99-1.785c-.54-.322-1.43-.322-1.98 0l-2.99 1.785c-2.14 1.28-3.44.322-2.88-2.118l.71-3.094c.13-.585-.1-1.402-.52-1.825l-2.48-2.5c-1.46-1.472-.99-2.964 1.05-3.307l3.19-.535c.53-.09 1.17-.564 1.41-1.058l1.76-3.549c.96-1.925 2.52-1.925 3.47 0z',
    heart: 'M19.463 3.994c-2.682-1.645-5.023-.982-6.429.074-.576.433-.864.65-1.034.65s-.458-.217-1.034-.65C9.56 3.012 7.219 2.349 4.537 3.994 1.018 6.153.222 13.274 8.34 19.284c1.546 1.145 2.319 1.717 3.66 1.717s2.114-.572 3.66-1.717c8.118-6.01 7.322-13.131 3.803-15.29z',
    bolt: 'M5.22 14.425L13.2 2.5c.4-.6 1.3-.3 1.3.4v6.35h4.26c.62 0 .98.7.62 1.2l-8.48 11.12c-.42.56-1.3.26-1.3-.44v-6.23H5.8c-.6 0-.96-.66-.58-1.18z'
  };

  var DEFAULTS = {
    value: undefined, defaultValue: 0, onChange: null, onPreview: null, count: 5, shape: 'star', labels: [],
    activeColor: '#f5b400', idleColor: '#52525b', tipColor: '#27272a', tipTextColor: '#f5f5f5',
    size: 28, lift: 6, magnify: 1.15, riseDuration: 320, popScale: 1.3, showTip: true, allowClear: true,
    readOnly: false, disabled: false, ariaLabel: 'Rating', className: ''
  };

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  function glyphSvg(shape, size) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', SHAPES[shape] || SHAPES.star);
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  window.PeekRating = function (container, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var count = o.count;
    var inner = o.defaultValue;
    var controlled = o.value !== undefined;
    var ctrlValue = o.value;
    var interactive = !o.readOnly && !o.disabled;
    function value() { return clamp(controlled ? ctrlValue : inner, 0, count); }

    var root = document.createElement('div');
    root.className = 'peek-rating' + (o.className ? ' ' + o.className : '');
    root.setAttribute('role', o.readOnly ? 'img' : 'radiogroup');
    if (o.disabled) root.setAttribute('aria-disabled', 'true');
    var tipRoom = interactive && o.showTip ? Math.round(o.size * 0.9) : 0;
    root.style.setProperty('--pr-active', o.activeColor);
    root.style.setProperty('--pr-idle', o.idleColor);
    root.style.setProperty('--pr-tip', o.tipColor);
    root.style.setProperty('--pr-tip-text', o.tipTextColor);
    root.style.setProperty('--pr-size', o.size + 'px');
    root.style.setProperty('--pr-gap', Math.round(o.size * 0.22) + 'px');
    root.style.setProperty('--pr-room', (o.lift + tipRoom) + 'px');
    root.style.setProperty('--pr-rise', o.riseDuration + 'ms');

    var row = document.createElement('div');
    row.className = 'peek-rating__row';
    root.appendChild(row);

    var tip = null;
    if (interactive && o.showTip) {
      tip = document.createElement('span');
      tip.className = 'peek-rating__tip';
      tip.setAttribute('aria-hidden', 'true');
      row.appendChild(tip);
    }

    var starEls = [], liftEls = [], glyphEls = [];
    for (var i = 0; i < count; i++) {
      var star = document.createElement(o.readOnly ? 'span' : 'button');
      star.className = 'peek-rating__star';
      if (!o.readOnly) {
        star.type = 'button';
        star.setAttribute('role', 'radio');
        star.setAttribute('aria-label', o.labels[i] ? (i + 1) + ' of ' + count + ', ' + o.labels[i] : (i + 1) + ' of ' + count);
      } else {
        star.setAttribute('aria-hidden', 'true');
      }
      var liftEl = document.createElement('span');
      liftEl.className = 'peek-rating__lift';
      var glyphEl = document.createElement('span');
      glyphEl.className = 'peek-rating__glyph';
      glyphEl.appendChild(glyphSvg(o.shape, o.size));
      liftEl.appendChild(glyphEl);
      star.appendChild(liftEl);
      row.appendChild(star);
      starEls.push(star); liftEls.push(liftEl); glyphEls.push(glyphEl);
    }
    container.appendChild(root);

    var st = { hover: null, pressing: false, pointerId: null, settled: false, rect: null, rtl: false };

    function syncAria() {
      var v = value();
      if (o.readOnly) root.setAttribute('aria-label', v + ' of ' + count);
      else root.setAttribute('aria-label', o.ariaLabel);
      starEls.forEach(function (el, i) {
        if (o.readOnly) return;
        var checked = v === i + 1;
        el.setAttribute('aria-checked', checked ? 'true' : 'false');
        el.tabIndex = !interactive ? -1 : (v === 0 ? i === 0 : checked) ? 0 : -1;
      });
    }

    function paint() {
      var previewing = st.hover !== null && !st.settled;
      var shown = previewing ? st.hover + 1 : value();
      var still = reducedMotion();
      for (var i = 0; i < count; i++) {
        var lifted = previewing && !still && i <= st.hover;
        liftEls[i].style.transform = lifted
          ? 'translateY(' + -o.lift + 'px) scale(' + (i === st.hover ? o.magnify : 1) + ')'
          : 'translateY(0px) scale(1)';
        glyphEls[i].dataset.lit = i < shown;
      }
      if (!tip) return;
      if (previewing && o.showTip) {
        var slot = row.clientWidth / count || o.size;
        var visual = st.rtl ? count - 1 - st.hover : st.hover;
        var wasHidden = tip.dataset.show !== 'true';
        if (wasHidden) tip.style.transition = 'none';
        tip.textContent = o.labels[st.hover] != null ? o.labels[st.hover] : String(st.hover + 1);
        tip.style.transform = 'translate(calc(' + slot * (visual + 0.5) + 'px - 50%), 0)';
        if (wasHidden) { void tip.offsetWidth; tip.style.transition = ''; }
        tip.dataset.show = 'true';
      } else {
        tip.dataset.show = 'false';
      }
    }

    function setHover(index) {
      if (index === st.hover) return;
      st.hover = index;
      if (index !== null) st.settled = false;
      paint();
      if (o.onPreview) o.onPreview(index === null ? null : index + 1);
    }

    function measure() {
      st.rect = row.getBoundingClientRect();
      st.rtl = getComputedStyle(row).direction === 'rtl';
    }

    function indexAt(x, y) {
      var rect = st.rect;
      if (!rect || !rect.width) return null;
      if (st.pressing && (y < rect.top - o.size || y > rect.bottom + o.size)) return null;
      var index = clamp(Math.floor(((x - rect.left) / rect.width) * count), 0, count - 1);
      return st.rtl ? count - 1 - index : index;
    }

    function commit(next, pop) {
      if (pop === undefined) pop = true;
      if (!controlled) inner = next;
      if (o.onChange) o.onChange(next);
      st.settled = true;
      syncAria();
      paint();
      var glyph = glyphEls[next - 1];
      if (pop && next > 0 && o.popScale > 1 && glyph && typeof glyph.animate === 'function' && !reducedMotion()) {
        glyph.getAnimations().forEach(function (a) { a.cancel(); });
        glyph.animate([
          { transform: 'scale(1)', easing: EASE_OUT },
          { transform: 'scale(' + o.popScale + ')', offset: 0.35, easing: EASE_OUT },
          { transform: 'scale(1)' }
        ], { duration: 300 });
      }
    }

    function onEnter(e) {
      if (!interactive || e.pointerType !== 'mouse') return;
      root.removeAttribute('data-instant');
      measure();
    }
    function onDown(e) {
      if (!interactive || e.button !== 0 || st.pointerId !== null) return;
      root.removeAttribute('data-instant');
      try { row.setPointerCapture(e.pointerId); } catch (err) {}
      st.pointerId = e.pointerId;
      st.pressing = true;
      measure();
      setHover(indexAt(e.clientX, e.clientY));
    }
    function onMove(e) {
      if (!interactive) return;
      if (e.pointerType !== 'mouse' && !st.pressing) return;
      if (st.pressing && e.pointerId !== st.pointerId) return;
      if (!st.pressing && !st.rect) measure();
      setHover(indexAt(e.clientX, e.clientY));
    }
    function endPress(e) {
      if (!st.pressing || e.pointerId !== st.pointerId) return;
      var hover = st.hover;
      st.pressing = false;
      st.pointerId = null;
      if (e.type === 'pointerup' && hover !== null) {
        var next = hover + 1;
        commit(o.allowClear && next === value() ? 0 : next);
      }
      if (e.pointerType !== 'mouse') setHover(null);
    }
    function onLeave() { if (!st.pressing) setHover(null); }

    function onKeyDown(e) {
      if (!interactive) return;
      var min = o.allowClear ? 0 : 1, v = value(), next;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowUp': next = clamp(v + 1, min, count); break;
        case 'ArrowLeft': case 'ArrowDown': next = clamp(v - 1, min, count); break;
        case 'Home': next = 1; break;
        case 'End': next = count; break;
        case 'Backspace': case 'Delete': if (!o.allowClear) return; next = 0; break;
        case ' ': case 'Enter': {
          var index = starEls.indexOf(e.target);
          if (index === -1) return;
          next = o.allowClear && index + 1 === v ? 0 : index + 1;
          break;
        }
        default: return;
      }
      e.preventDefault();
      root.setAttribute('data-instant', 'true');
      st.hover = null;
      commit(next, false);
      var focusEl = starEls[Math.max(next, 1) - 1];
      if (focusEl) focusEl.focus();
    }

    function reset() { st.pressing = false; st.pointerId = null; setHover(null); }
    function onVisibility() { if (document.hidden) reset(); }

    if (!o.readOnly) root.addEventListener('keydown', onKeyDown);
    row.addEventListener('pointerenter', onEnter);
    row.addEventListener('pointerdown', onDown);
    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', endPress);
    row.addEventListener('pointercancel', endPress);
    row.addEventListener('lostpointercapture', endPress);
    row.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', reset);

    syncAria();
    paint();

    return {
      setValue: function (v) { if (controlled) ctrlValue = v; else inner = v; st.settled = true; syncAria(); paint(); },
      getValue: value,
      destroy: function () {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('blur', reset);
        root.remove();
      }
    };
  };
})();
