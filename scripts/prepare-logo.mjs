/**
 * Turns the supplied KAYAZ logo (line art + red accents on a transparent sheet)
 * into the nav mark: bright cream strokes, red accents kept, plus a dark
 * outline so the mark still reads where the eye glow sits behind it.
 *
 * The artwork is drawn with thin strokes, so a straight downscale to nav size
 * leaves 1px lines at ~30% coverage, which composites as grey mush. So this
 * downscales first, thickens the remaining alpha, then pushes line coverage
 * towards solid.
 *
 * Run: npm run build-logo
 */
import fs from 'node:fs';
import pngjs from 'pngjs';

const { PNG } = pngjs;

const SRC = 'KAYAZlogo.png';
const OUT = 'assets/kayaz-logo.png';
const TARGET_HEIGHT = 120; // displayed at 40px; ~3x keeps it crisp
const STROKE = 1; // px of thickening, applied at TARGET_HEIGHT
const OUTLINE_RING = 3; // px radius the dark outline reaches
const PAD = 4;

const LINE = [255, 251, 248]; // bright cream so it reads on near-black
const RED = [255, 88, 72]; // between --accent and --accent-hi
const OUTLINE = [8, 5, 4];

if (!fs.existsSync(SRC)) {
  console.error(`[logo] ${SRC} not found, leaving ${OUT} untouched`);
  process.exit(1);
}

const src = PNG.sync.read(fs.readFileSync(SRC));
const { width: sw, height: sh, data: sd } = src;

const lumAt = (i) => 0.2126 * sd[i] + 0.7152 * sd[i + 1] + 0.0722 * sd[i + 2];
const satAt = (i) => Math.max(sd[i], sd[i + 1], sd[i + 2]) - Math.min(sd[i], sd[i + 1], sd[i + 2]);

// --- content bounds: everything that is not the transparent sheet ----------
let minX = sw;
let minY = sh;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < sh; y++) {
  for (let x = 0; x < sw; x++) {
    const i = (y * sw + x) * 4;
    if (!(sd[i + 3] > 16 && (lumAt(i) < 236 || satAt(i) > 36))) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
if (maxX < 0) {
  console.error('[logo] no ink found, aborting');
  process.exit(1);
}

minX = Math.max(0, minX - PAD);
minY = Math.max(0, minY - PAD);
maxX = Math.min(sw - 1, maxX + PAD);
maxY = Math.min(sh - 1, maxY + PAD);

// --- recolour every source pixel (premultiplied) ---------------------------
const ink = new Float32Array(sw * sh * 4); // r*a, g*a, b*a, a
for (let y = minY; y <= maxY; y++) {
  for (let x = minX; x <= maxX; x++) {
    const i = (y * sw + x) * 4;
    const srcAlpha = sd[i + 3] / 255;
    const lum = lumAt(i);
    const sat = satAt(i);
    const isRed = sat > 40 && sd[i] > sd[i + 1] && sd[i] > sd[i + 2];
    const color = isRed ? RED : LINE;
    const alpha = srcAlpha * (isRed ? Math.min(1, (sat - 24) / 96) : Math.min(1, Math.max(0, (238 - lum) / 150)));
    ink[i] = color[0] * alpha;
    ink[i + 1] = color[1] * alpha;
    ink[i + 2] = color[2] * alpha;
    ink[i + 3] = alpha;
  }
}

// --- area downscale to the working size ------------------------------------
const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
const scale = Math.min(1, TARGET_HEIGHT / cropH);
const w = Math.max(1, Math.round(cropW * scale));
const h = Math.max(1, Math.round(cropH * scale));

const color = new Float32Array(w * h * 3); // unpremultiplied
const coverage = new Float32Array(w * h);

for (let ty = 0; ty < h; ty++) {
  const y0 = minY + Math.floor((ty * cropH) / h);
  const y1 = minY + Math.max(y0 - minY + 1, Math.floor(((ty + 1) * cropH) / h));
  for (let tx = 0; tx < w; tx++) {
    const x0 = minX + Math.floor((tx * cropW) / w);
    const x1 = minX + Math.max(x0 - minX + 1, Math.floor(((tx + 1) * cropW) / w));
    let pr = 0;
    let pg = 0;
    let pb = 0;
    let pa = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * sw + x) * 4;
        pr += ink[i];
        pg += ink[i + 1];
        pb += ink[i + 2];
        pa += ink[i + 3];
        count++;
      }
    }
    const ti = ty * w + tx;
    coverage[ti] = count ? pa / count : 0;
    if (pa > 0) {
      color[ti * 3] = pr / pa;
      color[ti * 3 + 1] = pg / pa;
      color[ti * 3 + 2] = pb / pa;
    }
  }
}

// --- thicken the line work, then ring it with a dark outline --------------
function dilate(source, radius) {
  const result = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = source[yy * w + xx];
          if (v > best) best = v;
        }
      }
      result[y * w + x] = best;
    }
  }
  return result;
}

const stroke = dilate(coverage, STROKE);
const ring = dilate(coverage, OUTLINE_RING);

const out = new PNG({ width: w, height: h });
let stroked = 0;
let outlined = 0;
for (let i = 0; i < w * h; i++) {
  const solid = stroke[i];
  if (solid > 0.06) {
    stroked++;
    out.data[i * 4] = Math.round(Math.min(255, color[i * 3]));
    out.data[i * 4 + 1] = Math.round(Math.min(255, color[i * 3 + 1]));
    out.data[i * 4 + 2] = Math.round(Math.min(255, color[i * 3 + 2]));
    out.data[i * 4 + 3] = Math.round(Math.min(1, 0.62 + solid * 0.9) * 255);
  } else if (ring[i] > 0.06) {
    outlined++;
    out.data[i * 4] = OUTLINE[0];
    out.data[i * 4 + 1] = OUTLINE[1];
    out.data[i * 4 + 2] = OUTLINE[2];
    out.data[i * 4 + 3] = Math.round(0.88 * 255);
  } else {
    out.data[i * 4 + 3] = 0;
  }
}

fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(out));

console.log(
  `[logo] ${SRC} ${sw}x${sh} -> ${OUT} ${w}x${h} (crop ${cropW}x${cropH}, ${stroked} stroke px, ${outlined} outline px)`
);
