/**
 * EvilEye - React Bits (reactbits.dev), ported from the supplied React component
 * to a plain DOM mount so it can sit behind this static storefront.
 *
 * The noise texture, both shaders and every default are copied from upstream
 * unchanged. Only the React wrapper is gone: this module owns its own
 * requestAnimationFrame loop, resize handling, visibility pause and
 * reduced-motion still frame.
 *
 * Upstream licence: MIT + Commons Clause, (c) 2026 David Haz.
 * See THIRD_PARTY_NOTICES.md.
 */
import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';

/** Exact settings requested for the storefront background. */
export const EVIL_EYE_PROPS = {
  eyeColor: '#ff2020',
  intensity: 2.8,
  pupilSize: 0.85,
  irisWidth: 0.1,
  glowIntensity: 0.5,
  scale: 1,
  noiseScale: 1.0,
  pupilFollow: 1.9,
  flameSpeed: 0.3,
  backgroundColor: '#000000',
  lightMode: false
};

function hexToVec3(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  ];
}

function generateNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);

  function hash(x, y, s) {
    let n = x * 374761393 + y * 668265263 + s * 1274126177;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function noise(px, py, freq, seed) {
    const fx = (px / size) * freq;
    const fy = (py / size) * freq;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const w = freq | 0;
    const v00 = hash(((ix % w) + w) % w, ((iy % w) + w) % w, seed);
    const v10 = hash((((ix + 1) % w) + w) % w, ((iy % w) + w) % w, seed);
    const v01 = hash(((ix % w) + w) % w, (((iy + 1) % w) + w) % w, seed);
    const v11 = hash((((ix + 1) % w) + w) % w, (((iy + 1) % w) + w) % w, seed);
    return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.4;
      let totalAmp = 0;
      for (let o = 0; o < 8; o++) {
        const f = 32 * (1 << o);
        v += amp * noise(x, y, f, o * 31);
        totalAmp += amp;
        amp *= 0.65;
      }
      v /= totalAmp;
      v = (v - 0.5) * 2.2 + 0.5;
      v = Math.max(0, Math.min(1, v));
      const val = Math.round(v * 255);
      const i = (y * size + x) * 4;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
  }

  return data;
}

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform sampler2D uNoiseTexture;
uniform float uPupilSize;
uniform float uIrisWidth;
uniform float uGlowIntensity;
uniform float uIntensity;
uniform float uScale;
uniform float uNoiseScale;
uniform vec2 uMouse;
uniform float uPupilFollow;
uniform float uFlameSpeed;
uniform vec3 uEyeColor;
uniform vec3 uBgColor;
uniform bool uLightMode;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
  uv /= uScale;
  float ft = uTime * uFlameSpeed;

  float polarRadius = length(uv) * 2.0;
  float polarAngle = (2.0 * atan(uv.x, uv.y)) / 6.28 * 0.3;
  vec2 polarUv = vec2(polarRadius, polarAngle);

  vec4 noiseA = texture2D(uNoiseTexture, polarUv * vec2(0.2, 7.0) * uNoiseScale + vec2(-ft * 0.1, 0.0));
  vec4 noiseB = texture2D(uNoiseTexture, polarUv * vec2(0.3, 4.0) * uNoiseScale + vec2(-ft * 0.2, 0.0));
  vec4 noiseC = texture2D(uNoiseTexture, polarUv * vec2(0.1, 5.0) * uNoiseScale + vec2(-ft * 0.1, 0.0));

  float distanceMask = 1.0 - length(uv);

  // Inner ring
  float innerRing = clamp(-1.0 * ((distanceMask - 0.7) / uIrisWidth), 0.0, 1.0);
  innerRing = (innerRing * distanceMask - 0.2) / 0.28;
  innerRing += noiseA.r - 0.5;
  innerRing *= 1.3;
  innerRing = clamp(innerRing, 0.0, 1.0);

  float outerRing = clamp(-1.0 * ((distanceMask - 0.5) / 0.2), 0.0, 1.0);
  outerRing = (outerRing * distanceMask - 0.1) / 0.38;
  outerRing += noiseC.r - 0.5;
  outerRing *= 1.3;
  outerRing = clamp(outerRing, 0.0, 1.0);

  innerRing += outerRing;

  // Inner eye
  float innerEye = distanceMask - 0.1 * 2.0;
  innerEye *= noiseB.r * 2.0;

  // Pupil with cursor tracking
  vec2 pupilOffset = uMouse * uPupilFollow * 0.12;
  vec2 pupilUv = uv - pupilOffset;
  float pupil = 1.0 - length(pupilUv * vec2(9.0, 2.3));
  pupil *= uPupilSize;
  pupil = clamp(pupil, 0.0, 1.0);
  pupil /= 0.35;

  // Outer eye
  float outerEyeGlow = 1.0 - length(uv * vec2(0.5, 1.5));
  outerEyeGlow = clamp(outerEyeGlow + 0.5, 0.0, 1.0);
  outerEyeGlow += noiseC.r - 0.5;
  float outerBgGlow = outerEyeGlow;
  outerEyeGlow = pow(outerEyeGlow, 2.0);
  outerEyeGlow += distanceMask;
  outerEyeGlow *= uGlowIntensity;
  outerEyeGlow = clamp(outerEyeGlow, 0.0, 1.0);
  outerEyeGlow *= pow(1.0 - distanceMask, 2.0) * 2.5;

  // Outer eye bg glow
  outerBgGlow += distanceMask;
  outerBgGlow = pow(outerBgGlow, 0.5);
  outerBgGlow *= 0.15;

  vec3 eyeEnergy = uEyeColor * uIntensity * clamp(max(innerRing + innerEye, outerEyeGlow + outerBgGlow) - pupil, 0.0, 3.0);
  vec3 color;
  if (uLightMode) {
    vec3 mapped = vec3(1.0) - exp(-max(eyeEnergy, vec3(0.0)) * 1.3);
    float energy = clamp(max(mapped.r, max(mapped.g, mapped.b)), 0.0, 1.0);
    vec3 hue = mapped / max(energy, 0.0001);
    hue = pow(clamp(hue, 0.0, 1.0), vec3(1.2));
    color = mix(uBgColor, hue, smoothstep(0.02, 0.82, energy) * 0.96);
  } else {
    color = eyeEnergy + uBgColor;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Mounts the eye inside `container` and returns a handle, or null when the
 * browser cannot give us a WebGL context (the page keeps its CSS background).
 */
export function createEvilEye(container, options = {}) {
  const props = { ...EVIL_EYE_PROPS, ...options };
  const {
    eyeColor,
    intensity,
    pupilSize,
    irisWidth,
    glowIntensity,
    scale,
    noiseScale,
    pupilFollow,
    flameSpeed,
    backgroundColor,
    lightMode
  } = props;

  let renderer;
  try {
    renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: false,
      dpr: Math.min(window.devicePixelRatio || 1, props.maxDpr || 1.5)
    });
  } catch (error) {
    console.warn('[evil-eye] no WebGL context', error);
    return null;
  }
  if (!renderer || !renderer.gl) return null;

  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);

  const noiseTexture = new Texture(gl, {
    image: generateNoiseTexture(256),
    width: 256,
    height: 256,
    generateMipmaps: false,
    flipY: false
  });
  noiseTexture.minFilter = gl.LINEAR;
  noiseTexture.magFilter = gl.LINEAR;
  noiseTexture.wrapS = gl.REPEAT;
  noiseTexture.wrapT = gl.REPEAT;

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  function onPointerMove(event) {
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    mouse.tx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.ty = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  }

  // The canvas is pointer-events:none so the eye never eats a click, which
  // means the pointer has to be followed on the window instead of the element.
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  let program;
  function resize() {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    if (program) {
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height];
    }
  }
  window.addEventListener('resize', resize);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(container);
  resize();

  const geometry = new Triangle(gl);
  program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height] },
      uNoiseTexture: { value: noiseTexture },
      uPupilSize: { value: pupilSize },
      uIrisWidth: { value: irisWidth },
      uGlowIntensity: { value: glowIntensity },
      uIntensity: { value: intensity },
      uScale: { value: scale },
      uNoiseScale: { value: noiseScale },
      uMouse: { value: [0, 0] },
      uPupilFollow: { value: pupilFollow },
      uFlameSpeed: { value: flameSpeed },
      uEyeColor: { value: hexToVec3(eyeColor) },
      uBgColor: { value: hexToVec3(backgroundColor) },
      uLightMode: { value: lightMode }
    }
  });

  const mesh = new Mesh(gl, { geometry, program });
  container.appendChild(gl.canvas);

  function draw(time) {
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    program.uniforms.uMouse.value = [mouse.x, mouse.y];
    program.uniforms.uTime.value = time * 0.001;
    renderer.render({ scene: mesh });
  }

  let frameId = 0;
  let running = false;

  function loop(time) {
    frameId = requestAnimationFrame(loop);
    draw(time);
  }

  function start() {
    if (running || props.still) return;
    running = true;
    frameId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frameId);
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }
  document.addEventListener('visibilitychange', onVisibility);

  if (props.still) {
    // Reduced motion: one settled frame, no rAF loop at all.
    draw(6000);
  } else {
    start();
  }

  return {
    destroy() {
      stop();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (observer) observer.disconnect();
      if (gl.canvas.parentNode === container) container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  };
}

function mountAll() {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-evil-eye]').forEach((el) => {
    if (el.__evilEye) return;
    try {
      const instance = createEvilEye(el, { still, maxDpr: window.innerWidth < 820 ? 1 : 1.5 });
      if (instance) el.__evilEye = instance;
    } catch (error) {
      // Shader compile or context loss: the page keeps its CSS background.
      console.warn('[evil-eye] disabled', error);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll, { once: true });
} else {
  mountAll();
}
