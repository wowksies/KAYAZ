/**
 * CRTWarp - React Bits (reactbits.dev), ported from the supplied React component
 * to a plain DOM mount so it can sit behind this static storefront.
 *
 * What changed from upstream, and nothing else:
 *   - the React wrapper is gone; this module owns its own requestAnimationFrame
 *     loop, fps cap, pointer smoothing, visibility pause and destroy()
 *   - the renderer is ogl, which this site already bundles for its effects,
 *     instead of three.js. Both draw one full screen quad with a custom
 *     ShaderMaterial, so the GLSL, the uniforms and the output are identical.
 *     Pulling in three would add roughly 600 KB for the same picture.
 *   - pointer tracking listens on the window, because the canvas sits under
 *     `pointer-events: none`, and it only bends when the pointer is over the
 *     container.
 *   - reduced motion renders one settled frame instead of animating.
 *
 * The GLSL below, the uniform block and every default are copied from upstream
 * unchanged.
 *
 * Upstream licence: MIT + Commons Clause, (c) 2026 David Haz.
 * See THIRD_PARTY_NOTICES.md.
 */
import { Renderer, Program, Mesh, Triangle } from 'ogl';

/** Exact settings requested for the storefront background. */
export const CRT_WARP_PROPS = {
  color: '#930000',
  backgroundColor: '#17121e',
  speed: 0.5,
  curvature: 0.25,
  scanlineStrength: 0.25,
  scanlineFrequency: 200,
  waveAmplitude: 0.3,
  waveFrequency: 4.2,
  bloom: 1.5,
  bloomRadius: 1,
  noise: 0.1,
  vignette: 0,
  brightness: 1.25,
  pixelation: 1,
  rgbShift: 0.015,
  mouseReact: true,
  mouseStrength: 0.5,
  dpr: 1,
  fps: 30,
  paused: false
};

function hexToVec3(hex) {
  const h = String(hex).replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  ];
}

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uBackgroundColor;
uniform float uCurvature;
uniform float uScanlineStrength;
uniform float uScanlineFrequency;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uBloom;
uniform float uBloomRadius;
uniform float uNoise;
uniform float uVignette;
uniform float uBrightness;
uniform float uPixelation;
uniform float uRgbShift;
uniform vec2 uPointer;
uniform float uMouseStrength;
uniform float uMouseReact;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 crtCurve(vec2 uv, float radius) {
  vec2 p = (uv - 0.5) * 2.0;
  float safeRadius = max(radius, 1.415);
  float cornerScale = safeRadius / sqrt(max(safeRadius * safeRadius - 2.0, 0.001));
  p = safeRadius * p / sqrt(max(safeRadius * safeRadius - dot(p, p), 0.001));
  p /= cornerScale;
  return p * 0.5 + 0.5;
}

float referencePlasma(vec2 uv, float t) {
  float frequencyScale = max(uWaveFrequency / 2.2, 0.001);
  uv = (uv - 0.5) * frequencyScale + 0.5;

  float scanline = 0.5 - 0.5 * cos(uv.y * 3.14159265 * uScanlineFrequency);
  scanline = mix(1.0, scanline, uScanlineStrength);

  uv *= vec2(80.0, 24.0);
  uv = ceil(uv);
  uv /= vec2(80.0, 24.0);

  float amplitude = uWaveAmplitude / 0.28;
  float field = 0.0;
  field += 0.7 * sin(0.5 * uv.x + t / 5.0);
  field += 3.0 * sin(1.6 * uv.y + t / 5.0);
  field += sin(10.0 * (uv.y * sin(t / 2.0) + uv.x * cos(t / 5.0)) + t / 2.0);

  float cx = uv.x + 0.5 * sin(t / 2.0);
  float cy = uv.y + 0.5 * cos(t / 4.0);
  field += 0.4 * sin(sqrt(100.0 * cx * cx + 100.0 * cy * cy + 1.0) + t);
  field += 0.9 * sin(sqrt(75.0 * cx * cx + 25.0 * cy * cy + 1.0) + t);
  field -= 1.4 * sin(sqrt(256.0 * cx * cx + 25.0 * cy * cy + 1.0) + t);
  field += 0.3 * sin(0.5 * uv.y + uv.x + sin(t));

  return scanline * floor(3.0 * (0.5 + 0.499 * sin(field * amplitude))) / 3.0;
}

void main() {
  vec2 uv = vUv;
  if (uPixelation > 1.001) {
    vec2 cells = max(uResolution / uPixelation, vec2(1.0));
    uv = (floor(uv * cells) + 0.5) / cells;
  }

  float curveRadius = 1.1 + 0.42 / max(uCurvature, 0.001);
  if (uMouseReact > 0.5) {
    curveRadius *= exp(-uPointer.y * uMouseStrength * 0.4);
  }
  vec2 curvedUv = crtCurve(uv, curveRadius);
  if (uMouseReact > 0.5) {
    curvedUv.x -= uPointer.x * uMouseStrength * 0.035;
  }

  float signal = referencePlasma(curvedUv, uTime);
  float radius = 0.01 * uBloomRadius;
  float glow = signal * 0.2;
  glow += referencePlasma(curvedUv + vec2(radius, 0.0), uTime) * 0.12;
  glow += referencePlasma(curvedUv - vec2(radius, 0.0), uTime) * 0.12;
  glow += referencePlasma(curvedUv + vec2(0.0, radius), uTime) * 0.12;
  glow += referencePlasma(curvedUv - vec2(0.0, radius), uTime) * 0.12;
  glow += referencePlasma(curvedUv + vec2(radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv - vec2(radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv + vec2(radius, -radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv + vec2(-radius, radius), uTime) * 0.08;

  float redSignal = referencePlasma(curvedUv + vec2(uRgbShift, 0.0), uTime);
  float blueSignal = referencePlasma(curvedUv - vec2(uRgbShift, 0.0), uTime);
  vec3 channelSignal = vec3(redSignal, signal, blueSignal);
  vec3 waveColor = uColor * (0.3 + signal * 0.7 + glow * uBloom * 0.65);
  waveColor += (channelSignal - signal) * 0.42;

  float edge = clamp(1.0 - dot(vUv - 0.5, vUv - 0.5) * 2.0, 0.0, 1.0);
  float edgeFade = mix(1.0, smoothstep(0.0, 1.0, edge), uVignette);
  float waveMask = clamp(signal * 0.82 + glow * 0.52, 0.0, 1.0) * edgeFade;

  float grain = hash21(gl_FragCoord.xy + vec2(fract(uTime) * 173.0));
  waveColor = max(waveColor * uBrightness, vec3(0.0));
  vec3 color = mix(uBackgroundColor, waveColor, waveMask);
  color += (grain - 0.5) * uNoise;
  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
`;

/** The settled time used for the single reduced-motion frame. */
const STILL_TIME = 12.5;

/**
 * Mounts the warp inside `container` and returns a handle, or null when the
 * browser cannot give us a WebGL context (the page keeps its CSS background).
 */
export function createCRTWarp(container, options = {}) {
  const props = { ...CRT_WARP_PROPS, ...options };
  const still = Boolean(props.still);
  const fps = Math.max(1, Number(props.fps) || 30);

  let renderer;
  try {
    renderer = new Renderer({
      alpha: false,
      premultipliedAlpha: false,
      antialias: false,
      powerPreference: 'low-power',
      dpr: Math.min(window.devicePixelRatio || 1, Math.max(Number(props.dpr) || 1, 0.1))
    });
  } catch (error) {
    console.warn('[crt-warp] no WebGL context', error);
    return null;
  }
  if (!renderer || !renderer.gl) return null;

  const gl = renderer.gl;
  const backgroundColor = hexToVec3(props.backgroundColor);
  gl.clearColor(backgroundColor[0], backgroundColor[1], backgroundColor[2], 1);

  let program;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const visible = { active: true };
  let frameId = 0;
  let running = false;
  let lastFrame = 0;
  let previousTime = 0;

  function renderFrame() {
    renderer.render({ scene: mesh });
  }

  const geometry = new Triangle(gl);
  program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      uResolution: { value: [1, 1] },
      uTime: { value: 0 },
      uSpeed: { value: props.speed },
      uColor: { value: hexToVec3(props.color) },
      uBackgroundColor: { value: backgroundColor },
      uCurvature: { value: props.curvature },
      uScanlineStrength: { value: props.scanlineStrength },
      uScanlineFrequency: { value: props.scanlineFrequency },
      uWaveAmplitude: { value: props.waveAmplitude },
      uWaveFrequency: { value: props.waveFrequency },
      uBloom: { value: props.bloom },
      uBloomRadius: { value: props.bloomRadius },
      uNoise: { value: props.noise },
      uVignette: { value: props.vignette },
      uBrightness: { value: props.brightness },
      uPixelation: { value: props.pixelation },
      uRgbShift: { value: props.rgbShift },
      uPointer: { value: [0, 0] },
      uMouseStrength: { value: props.mouseStrength },
      uMouseReact: { value: props.mouseReact ? 1 : 0 }
    }
  });

  const mesh = new Mesh(gl, { geometry, program });

  function resize() {
    const width = Math.max(container.clientWidth || window.innerWidth, 1);
    const height = Math.max(container.clientHeight || window.innerHeight, 1);
    renderer.setSize(width, height);
    program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
    if (still) {
      program.uniforms.uTime.value = STILL_TIME;
      program.uniforms.uPointer.value = [0, 0];
      renderFrame();
    }
  }

  container.appendChild(gl.canvas);
  resize();

  window.addEventListener('resize', resize);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(container);

  // The canvas is pointer-events:none, so the pointer is followed on the window
  // and only bends the signal while it is actually over the container.
  function onPointerMove(event) {
    const rect = container.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) {
      pointer.tx = 0;
      pointer.ty = 0;
      return;
    }
    pointer.tx = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    pointer.ty = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
  }
  if (props.mouseReact) window.addEventListener('pointermove', onPointerMove, { passive: true });

  const visibilityObserver = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => {
      visible.active = entries[0] ? entries[0].isIntersecting : true;
    })
    : null;
  if (visibilityObserver) visibilityObserver.observe(container);

  function frame(now) {
    frameId = requestAnimationFrame(frame);
    if (!visible.active || document.hidden) {
      previousTime = now;
      return;
    }
    const interval = 1000 / fps;
    if (now - lastFrame < interval) return;
    lastFrame = now - ((now - lastFrame) % interval);

    const delta = Math.min((now - previousTime) / 1000, 0.1);
    previousTime = now;

    if (!props.paused) program.uniforms.uTime.value += delta * props.speed;
    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;
    program.uniforms.uPointer.value = [pointer.x, pointer.y];
    renderFrame();
  }

  function start() {
    if (running || still) return;
    running = true;
    previousTime = performance.now();
    lastFrame = previousTime;
    frameId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frameId);
  }

  function onVisibilityChange() {
    if (document.hidden) stop();
    else start();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  start();

  return {
    program,
    destroy() {
      stop();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (observer) observer.disconnect();
      if (visibilityObserver) visibilityObserver.disconnect();
      geometry.dispose?.();
      program.dispose?.();
      renderer.dispose?.();
      if (gl.canvas.parentNode === container) container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  };
}

/** Merges `data-crt-props` (JSON) over the defaults for one container. */
function readProps(el) {
  const raw = el.getAttribute('data-crt-props');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('[crt-warp] ignoring unreadable data-crt-props', error);
    return {};
  }
}

export function mountAll(root = document) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-crt-warp]').forEach((el) => {
    if (el.__crtWarp) return;
    try {
      const instance = createCRTWarp(el, { ...readProps(el), still });
      if (instance) el.__crtWarp = instance;
    } catch (error) {
      // Shader compile or context loss: the page keeps its CSS background.
      console.warn('[crt-warp] disabled', error);
    }
  });
}

export function mount(container, options = {}) {
  if (!container || container.__crtWarp) return null;
  const instance = createCRTWarp(container, { ...readProps(container), ...options });
  if (instance) container.__crtWarp = instance;
  return instance;
}

if (typeof window !== 'undefined') {
  window.KayazCRTWarp = { create: createCRTWarp, mount, mountAll };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountAll(), { once: true });
} else {
  mountAll();
}
