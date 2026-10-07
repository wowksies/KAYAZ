/**
 * PixelCard - React Bits (reactbits.dev), ported from the supplied React
 * component to a plain DOM mount so it can wrap the storefront's own cards.
 *
 * What changed from upstream, and nothing else:
 *   - the React wrapper is gone; the mounted container owns its canvas, its
 *     own mount/update lifecycle and destroy()
 *   - settings can come from data attributes (see mountAll) or from mount()
 *   - reduced motion keeps the card still instead of animating, matching the
 *     rest of the page
 *
 * The Pixel class, getEffectiveSpeed, the variant table and the 60 fps loop are
 * copied from upstream unchanged.
 *
 * Upstream licence: MIT + Commons Clause, (c) 2026 David Haz.
 * See THIRD_PARTY_NOTICES.md.
 */

class Pixel {
  constructor(canvas, context, x, y, color, speed, delay) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = context;
    this.x = x;
    this.y = y;
    this.color = color;
    this.speed = this.getRandomValue(0.1, 0.9) * speed;
    this.size = 0;
    this.sizeStep = Math.random() * 0.4;
    this.minSize = 0.5;
    this.maxSizeInteger = 2;
    this.maxSize = this.getRandomValue(this.minSize, this.maxSizeInteger);
    this.delay = delay;
    this.counter = 0;
    this.counterStep = Math.random() * 4 + (this.width + this.height) * 0.01;
    this.isIdle = false;
    this.isReverse = false;
    this.isShimmer = false;
  }

  getRandomValue(min, max) {
    return Math.random() * (max - min) + min;
  }

  draw() {
    const centerOffset = this.maxSizeInteger * 0.5 - this.size * 0.5;
    this.ctx.fillStyle = this.color;
    this.ctx.fillRect(this.x + centerOffset, this.y + centerOffset, this.size, this.size);
  }

  appear() {
    this.isIdle = false;
    if (this.counter <= this.delay) {
      this.counter += this.counterStep;
      return;
    }
    if (this.size >= this.maxSize) {
      this.isShimmer = true;
    }
    if (this.isShimmer) {
      this.shimmer();
    } else {
      this.size += this.sizeStep;
    }
    this.draw();
  }

  disappear() {
    this.isShimmer = false;
    this.counter = 0;
    if (this.size <= 0) {
      this.isIdle = true;
      return;
    } else {
      this.size -= 0.1;
    }
    this.draw();
  }

  shimmer() {
    if (this.size >= this.maxSize) {
      this.isReverse = true;
    } else if (this.size <= this.minSize) {
      this.isReverse = false;
    }
    if (this.isReverse) {
      this.size -= this.speed;
    } else {
      this.size += this.speed;
    }
  }
}

function getEffectiveSpeed(value, reducedMotion) {
  const min = 0;
  const max = 100;
  const throttle = 0.001;
  const parsed = parseInt(value, 10);

  if (parsed <= min || reducedMotion) {
    return min;
  } else if (parsed >= max) {
    return max * throttle;
  } else {
    return parsed * throttle;
  }
}

const VARIANTS = {
  default: {
    activeColor: null,
    gap: 5,
    speed: 35,
    colors: '#f8fafc,#f1f5f9,#cbd5e1',
    noFocus: false
  },
  blue: {
    activeColor: '#e0f2fe',
    gap: 10,
    speed: 25,
    colors: '#e0f2fe,#7dd3fc,#0ea5e9',
    noFocus: false
  },
  yellow: {
    activeColor: '#fef08a',
    gap: 3,
    speed: 20,
    colors: '#fef08a,#fde047,#eab308',
    noFocus: false
  },
  pink: {
    activeColor: '#fecdd3',
    gap: 6,
    speed: 80,
    colors: '#fecdd3,#fda4af,#e11d48',
    noFocus: true
  }
};

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Wraps one container (the card itself) with the pixel effect. The canvas is a
 * child of the container and everything else inside is left alone, so the card
 * keeps its own markup, links and buttons. Returns a handle, or null when the
 * container cannot take a 2d context.
 */
export function createPixelCard(container, options = {}) {
  if (!container) return null;

  const variantCfg = VARIANTS[options.variant] || VARIANTS.default;
  const gap = options.gap ?? variantCfg.gap;
  const speed = options.speed ?? variantCfg.speed;
  const colors = options.colors ?? variantCfg.colors;
  const noFocus = options.noFocus ?? variantCfg.noFocus;
  const reducedMotion = prefersReducedMotion();

  const canvas = document.createElement('canvas');
  canvas.className = 'pixel-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  container.classList.add('pixel-card');
  if (variantCfg.activeColor) container.style.setProperty('--pixel-card-active-color', variantCfg.activeColor);
  container.appendChild(canvas);

  let pixels = [];
  let frameId = 0;
  let animating = false;
  let timePrevious = performance.now();

  function initPixels() {
    const rect = container.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const colorsArray = String(colors).split(',');
    const step = parseInt(gap, 10) || VARIANTS.default.gap;
    const effectiveSpeed = getEffectiveSpeed(speed, reducedMotion);
    const next = [];
    for (let x = 0; x < width; x += step) {
      for (let y = 0; y < height; y += step) {
        const color = colorsArray[Math.floor(Math.random() * colorsArray.length)];
        const dx = x - width / 2;
        const dy = y - height / 2;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const delay = reducedMotion ? 0 : distance;
        next.push(new Pixel(canvas, ctx, x, y, color, effectiveSpeed, delay));
      }
    }
    pixels = next;
  }

  function drawFrame(name) {
    frameId = requestAnimationFrame(() => drawFrame(name));
    const timeNow = performance.now();
    const timePassed = timeNow - timePrevious;
    const timeInterval = 1000 / 60;

    if (timePassed < timeInterval) return;
    timePrevious = timeNow - (timePassed % timeInterval);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let allIdle = true;
    for (let i = 0; i < pixels.length; i++) {
      const pixel = pixels[i];
      pixel[name]();
      if (!pixel.isIdle) allIdle = false;
    }
    if (allIdle) {
      animating = false;
      cancelAnimationFrame(frameId);
    }
  }

  function handleAnimation(name) {
    if (reducedMotion) return;
    cancelAnimationFrame(frameId);
    animating = true;
    frameId = requestAnimationFrame(() => drawFrame(name));
  }

  function onPointerEnter() { handleAnimation('appear'); }
  function onPointerLeave() { handleAnimation('disappear'); }
  function onFocusIn() { handleAnimation('appear'); }
  function onFocusOut(event) {
    if (container.contains(event.relatedTarget)) return;
    handleAnimation('disappear');
  }

  initPixels();

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    canvas.width = 0;
    canvas.height = 0;
    initPixels();
  }) : null;
  if (observer) observer.observe(container);

  container.addEventListener('pointerenter', onPointerEnter);
  container.addEventListener('pointerleave', onPointerLeave);
  if (!noFocus) {
    container.addEventListener('focusin', onFocusIn);
    container.addEventListener('focusout', onFocusOut);
    if (container.tabIndex < 0) container.tabIndex = 0;
  }

  return {
    update(next = {}) {
      Object.assign(options, next);
      initPixels();
    },
    hide() {
      cancelAnimationFrame(frameId);
      animating = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pixels = [];
    },
    destroy() {
      cancelAnimationFrame(frameId);
      animating = false;
      if (observer) observer.disconnect();
      container.removeEventListener('pointerenter', onPointerEnter);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('focusin', onFocusIn);
      container.removeEventListener('focusout', onFocusOut);
      if (canvas.parentNode === container) container.removeChild(canvas);
      container.__kayazPixelCard = null;
    },
    get animationRunning() { return animating; }
  };
}

/** Mounts one container, unless it is already wrapped. */
export function mount(container, options = {}) {
  if (!container || container.__kayazPixelCard) return null;
  let instance = null;
  try {
    instance = createPixelCard(container, options);
  } catch (error) {
    console.warn('[pixel-card] disabled', error);
  }
  if (instance) container.__kayazPixelCard = instance;
  return instance;
}

const DATA_FLAGS = { '': true, 'true': true, '1': true, 'yes': true };

export function mountAll(root = document) {
  root.querySelectorAll('[data-pixel-card]').forEach((el) => {
    if (el.__kayazPixelCard) return;
    const gap = el.getAttribute('data-gap');
    const speed = el.getAttribute('data-speed');
    const colors = el.getAttribute('data-colors');
    const noFocus = el.getAttribute('data-no-focus');
    mount(el, {
      variant: el.getAttribute('data-variant') || 'default',
      ...(gap ? { gap: Number(gap) } : {}),
      ...(speed ? { speed: Number(speed) } : {}),
      ...(colors ? { colors } : {}),
      ...(noFocus === null ? {} : { noFocus: DATA_FLAGS[noFocus] ?? true })
    });
  });
}

if (typeof window !== 'undefined') {
  window.KayazPixelCard = { create: createPixelCard, mount, mountAll };
  const onReady = () => mountAll();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
  window.addEventListener('load', onReady);
}
