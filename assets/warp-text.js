// WarpText from React Bits (reactbits.dev), ported to plain JS + raw WebGL2 (no ogl) for this static site.
// Usage: WarpText(containerEl, { text: 'Hello', ... }) -> { destroy } or null if WebGL2 isn't available.
(function () {
  var VERTEX = '#version 300 es\n' +
    'in vec2 position;\nin vec2 uv;\nout vec2 vUv;\n' +
    'void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }\n';

  var FRAGMENT = '#version 300 es\n' +
    'precision highp float;\n' +
    'uniform sampler2D uTextTexture;\nuniform vec2 uResolution;\nuniform vec2 uPointer;\nuniform float uPointerActive;\n' +
    'uniform float uTime;\nuniform float uWarpStrength;\nuniform float uWarpScale;\nuniform float uSpeed;\n' +
    'uniform float uPointerInfluence;\nuniform float uPointerStrength;\nuniform float uRefraction;\nuniform float uRipple;\nuniform float uMotion;\n' +
    'in vec2 vUv;\nout vec4 fragColor;\n' +
    'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\n' +
    'float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);\n' +
    '  float a = hash(i); float b = hash(i + vec2(1.0, 0.0)); float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));\n' +
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }\n' +
    'float fbm(vec2 p) { float value = 0.0; float amplitude = 0.5;\n' +
    '  for (int i = 0; i < 4; i++) { value += amplitude * noise(p); p *= 2.02; amplitude *= 0.5; } return value; }\n' +
    'vec4 sampleText(vec2 uv) { if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec4(0.0); } return texture(uTextTexture, uv); }\n' +
    'void main() {\n' +
    '  vec2 uv = vUv;\n' +
    '  float aspect = uResolution.x / max(uResolution.y, 1.0);\n' +
    '  float time = uTime * uSpeed;\n' +
    '  float scale = max(uWarpScale, 0.001);\n' +
    '  vec2 drift = vec2(time * 0.055, -time * 0.045);\n' +
    '  float n1 = fbm(uv * scale * 3.1 + drift);\n' +
    '  float n2 = fbm((uv + 19.17) * scale * 3.4 - drift.yx);\n' +
    '  vec2 ambient = (vec2(n1, n2) - 0.5) * uWarpStrength * 0.045 * uMotion;\n' +
    '  vec2 pointerDelta = uv - uPointer;\n' +
    '  vec2 aspectDelta = vec2(pointerDelta.x * aspect, pointerDelta.y);\n' +
    '  float dist = length(aspectDelta);\n' +
    '  float radius = max(uPointerInfluence, 0.001);\n' +
    '  float t = clamp(dist / radius, 0.0, 1.0);\n' +
    '  float lens = smoothstep(radius, 0.0, dist) * uPointerActive;\n' +
    '  float bulge = t * (1.0 - t) * (1.0 - t) * 6.75 * uPointerActive;\n' +
    '  vec2 dir = dist > 0.0001 ? vec2(aspectDelta.x / aspect, aspectDelta.y) / dist : vec2(0.0);\n' +
    '  float rippleWave = sin(dist * 28.0 - time * 4.2) * 0.5 + 0.5;\n' +
    '  float rippleRing = (rippleWave - 0.5) * uRipple;\n' +
    '  vec2 pointerWarp = -dir * bulge * uPointerStrength * 0.045;\n' +
    '  pointerWarp += dir * rippleRing * bulge * uPointerStrength * 0.016;\n' +
    '  vec2 displaced = uv + ambient + pointerWarp;\n' +
    '  vec2 splitDir = ambient + pointerWarp;\n' +
    '  float splitLen = length(splitDir);\n' +
    '  splitDir = splitLen > 0.00001 ? splitDir / splitLen : vec2(0.7071, 0.7071);\n' +
    '  vec2 split = splitDir * uRefraction * 0.16 * (0.35 + lens * 1.65);\n' +
    '  vec4 base = sampleText(displaced);\n' +
    '  float r = sampleText(displaced + split).r;\n' +
    '  float g = base.g;\n' +
    '  float b = sampleText(displaced - split).b;\n' +
    '  float a = max(max(sampleText(displaced + split).a, base.a), sampleText(displaced - split).a);\n' +
    '  vec3 color = vec3(r, g, b) + lens * base.a * 0.055;\n' +
    '  fragColor = vec4(color, a);\n' +
    '}\n';

  var DEFAULTS = {
    text: 'Bend the moment',
    color: '#f8f5ff',
    warpStrength: 0.08,
    warpScale: 1.7,
    speed: 0.55,
    pointerInfluence: 0.42,
    pointerStrength: 0.38,
    refraction: 0.018,
    ripple: true,
    fontSize: 'clamp(3rem, 10vw, 9rem)',
    fontWeight: 800,
    fontFamily: 'inherit',
    letterSpacing: '-0.06em',
    lineHeight: 0.9
  };

  function fontValue(v) { return typeof v === 'number' ? v + 'px' : v; }

  function measureLine(ctx, line, spacing) {
    var chars = Array.from(line);
    var w = chars.reduce(function (acc, ch) { return acc + ctx.measureText(ch).width; }, 0);
    return w + Math.max(0, chars.length - 1) * spacing;
  }

  function drawLine(ctx, line, x, y, spacing) {
    var chars = Array.from(line);
    var cursor = x - measureLine(ctx, line, spacing) / 2;
    chars.forEach(function (ch, i) {
      ctx.fillText(ch, cursor, y);
      cursor += ctx.measureText(ch).width + (i === chars.length - 1 ? 0 : spacing);
    });
  }

  function buildTextCanvas(container, width, height, dpr, p) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    var ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    var probe = document.createElement('span');
    probe.textContent = p.text;
    Object.assign(probe.style, {
      position: 'absolute', visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'pre', inset: '0 auto auto 0',
      fontFamily: p.fontFamily, fontSize: fontValue(p.fontSize), fontWeight: String(p.fontWeight),
      letterSpacing: fontValue(p.letterSpacing),
      lineHeight: typeof p.lineHeight === 'number' ? String(p.lineHeight) : p.lineHeight
    });
    container.appendChild(probe);
    var cs = window.getComputedStyle(probe);
    var fontSizePx = parseFloat(cs.fontSize) || 96;
    var fontFamily = cs.fontFamily || 'sans-serif';
    var fontWeight = cs.fontWeight || String(p.fontWeight);
    var spacing = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0;
    var lineHeight = parseFloat(cs.lineHeight);
    if (!isFinite(lineHeight)) lineHeight = fontSizePx * (typeof p.lineHeight === 'number' ? p.lineHeight : 0.92);
    probe.remove();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.color;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    var lines = String(p.text || '').split('\n');
    function applyFont() { ctx.font = fontWeight + ' ' + fontSizePx + 'px ' + fontFamily; }
    applyFont();
    var widest = Math.max.apply(null, lines.map(function (l) { return measureLine(ctx, l, spacing); }).concat([1]));
    var blockHeight = Math.max(lineHeight * lines.length, 1);
    var fit = Math.min(1, (width * 0.86) / widest, (height * 0.78) / blockHeight);
    if (fit < 1) { fontSizePx *= fit; spacing *= fit; lineHeight *= fit; applyFont(); }
    var startY = height / 2 - (lineHeight * (lines.length - 1)) / 2;
    lines.forEach(function (l, i) { drawLine(ctx, l, width / 2, startY + i * lineHeight, spacing); });
    return canvas;
  }

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn('WarpText shader:', gl.getShaderInfoLog(sh)); return null; }
    return sh;
  }

  window.WarpText = function (container, opts) {
    var p = Object.assign({}, DEFAULTS, opts || {});
    container.classList.add('warp-text');
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', p.text);

    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) return null;
    var vs = compile(gl, gl.VERTEX_SHADER, VERTEX), fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    // one big triangle covering the viewport, same as ogl's Triangle
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    function attrib(name, data) {
      var loc = gl.getAttribLocation(prog, name);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    attrib('position', [-1, -1, 3, -1, -1, 3]);
    attrib('uv', [0, 0, 2, 0, 0, 2]);

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

    var U = {};
    ['uTextTexture', 'uResolution', 'uPointer', 'uPointerActive', 'uTime', 'uWarpStrength', 'uWarpScale', 'uSpeed',
      'uPointerInfluence', 'uPointerStrength', 'uRefraction', 'uRipple', 'uMotion'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
    gl.uniform1i(U.uTextTexture, 0);
    gl.uniform1f(U.uWarpStrength, p.warpStrength);
    gl.uniform1f(U.uWarpScale, p.warpScale);
    gl.uniform1f(U.uSpeed, p.speed);
    gl.uniform1f(U.uPointerInfluence, p.pointerInfluence);
    gl.uniform1f(U.uPointerStrength, p.pointerStrength);
    gl.uniform1f(U.uRefraction, p.refraction);
    gl.uniform1f(U.uRipple, p.ripple ? 1 : 0);
    gl.clearColor(0, 0, 0, 0);

    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduceMotion = mq ? mq.matches : false;
    gl.uniform1f(U.uMotion, reduceMotion ? 0 : 1);

    var raf = 0, disposed = false, contextLost = false, visible = true, pageVisible = !document.hidden, rasterVersion = 0;
    var pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, activeTarget: 0 };
    var startTime = performance.now();

    function renderOnce() {
      if (disposed || contextLost) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function rasterize() {
      var version = ++rasterVersion;
      var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      ready.catch(function () {}).then(function () {
        if (disposed || contextLost || version !== rasterVersion) return;
        var rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var textCanvas = buildTextCanvas(container, rect.width, rect.height, dpr, p);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
        renderOnce();
      });
    }

    function resize() {
      if (disposed || contextLost) return;
      var rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      gl.uniform2f(U.uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
      rasterize();
    }

    function onPointerMove(e) {
      if (e.pointerType === 'touch') return;
      var rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointer.tx = (e.clientX - rect.left) / rect.width;
      pointer.ty = 1 - (e.clientY - rect.top) / rect.height;
      pointer.activeTarget = 1;
    }
    function onPointerLeave() { pointer.activeTarget = 0; }
    function onContextLost(e) { e.preventDefault(); contextLost = true; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function onVisibility() {
      pageVisible = !document.hidden;
      if (pageVisible && visible && !raf) raf = requestAnimationFrame(loop);
      if (!pageVisible && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    function onReducedMotion(e) { reduceMotion = e.matches; gl.uniform1f(U.uMotion, reduceMotion ? 0 : 1); renderOnce(); }

    function loop(now) {
      if (disposed || contextLost) return;
      var elapsed = (now - startTime) * 0.001;
      var idleX = 0.5 + Math.sin(elapsed * 0.33) * 0.12;
      var idleY = 0.5 + Math.cos(elapsed * 0.27) * 0.1;
      var targetX = pointer.activeTarget > 0 ? pointer.tx : idleX;
      var targetY = pointer.activeTarget > 0 ? pointer.ty : idleY;
      var damping = pointer.activeTarget > 0 ? 0.12 : 0.035;
      pointer.x += (targetX - pointer.x) * damping;
      pointer.y += (targetY - pointer.y) * damping;
      pointer.active += ((pointer.activeTarget > 0 ? 1 : 0.18) - pointer.active) * 0.06;
      gl.uniform2f(U.uPointer, pointer.x, pointer.y);
      gl.uniform1f(U.uPointerActive, reduceMotion ? pointer.active * 0.35 : pointer.active);
      gl.uniform1f(U.uTime, reduceMotion ? 0 : elapsed);
      renderOnce();
      raf = requestAnimationFrame(loop);
    }

    var ro = new ResizeObserver(resize);
    ro.observe(container);
    var io = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && pageVisible && !raf) raf = requestAnimationFrame(loop);
      if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0 });
    io.observe(container);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    document.addEventListener('visibilitychange', onVisibility);
    if (mq && mq.addEventListener) mq.addEventListener('change', onReducedMotion);

    resize();
    raf = requestAnimationFrame(loop);

    return {
      destroy: function () {
        disposed = true;
        if (raf) cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        document.removeEventListener('visibilitychange', onVisibility);
        if (mq && mq.removeEventListener) mq.removeEventListener('change', onReducedMotion);
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        canvas.remove();
      }
    };
  };
})();
