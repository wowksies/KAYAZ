   
                                                                               
                                                                             
                                               
  
                                                                            
                                                                             
                                                                        
                                                                           
  
                                                                               
                                                                              
                                                                           
                          
  
                          
   
import fs from 'node:fs';
import pngjs from 'pngjs';

const { PNG } = pngjs;

const SRC = 'KAYAZlogo.png';
const OUT = 'assets/kayaz-logo.png';
const TARGET_HEIGHT = 120;                                                   
const STROKE = 1;                                              
const PAD = 4;

const LINE = [255, 251, 248];                                          
const RED = [255, 88, 72];                                    

if (!fs.existsSync(SRC)) {
  console.error(`[logo] ${SRC} not found, leaving ${OUT} untouched`);
  process.exit(1);
}

const src = PNG.sync.read(fs.readFileSync(SRC));
const { width: sw, height: sh, data: sd } = src;

                                                            
const redEdgeAt = (i) => sd[i] - Math.max(sd[i + 1], sd[i + 2]);

                                                                              
let minX = sw;
let minY = sh;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < sh; y++) {
  for (let x = 0; x < sw; x++) {
    const i = (y * sw + x) * 4;
    if (sd[i + 3] <= 16) continue;
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

                                                                              
                                                                                
                                                                        
                                
const ink = new Float32Array(sw * sh * 4);                    
for (let y = minY; y <= maxY; y++) {
  for (let x = minX; x <= maxX; x++) {
    const i = (y * sw + x) * 4;
    const srcAlpha = sd[i + 3] / 255;
    if (srcAlpha <= 0) continue;
    const redEdge = redEdgeAt(i);
    const isRed = redEdge > 14 && sd[i] > 36;
    const color = isRed ? RED : LINE;
    const weight = isRed ? Math.min(1, Math.max(0, (redEdge - 6) / 60)) : 1;
    const alpha = srcAlpha * weight;
    ink[i] = color[0] * alpha;
    ink[i + 1] = color[1] * alpha;
    ink[i + 2] = color[2] * alpha;
    ink[i + 3] = alpha;
  }
}

                                                                              
const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
const scale = Math.min(1, TARGET_HEIGHT / cropH);
const w = Math.max(1, Math.round(cropW * scale));
const h = Math.max(1, Math.round(cropH * scale));

const color = new Float32Array(w * h * 3);                   
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

                                                                              
                                                                             
                                                                            
function growInk(radius) {
  const spread = new Float32Array(w * h);
  const spreadColor = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = -1;
      let bestValue = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const n = yy * w + xx;
          if (coverage[n] > bestValue) {
            bestValue = coverage[n];
            best = n;
          }
        }
      }
      const i = y * w + x;
      spread[i] = bestValue;
      if (best >= 0) {
        spreadColor[i * 3] = color[best * 3];
        spreadColor[i * 3 + 1] = color[best * 3 + 1];
        spreadColor[i * 3 + 2] = color[best * 3 + 2];
      }
    }
  }
  return { spread, spreadColor };
}

const { spread, spreadColor } = growInk(STROKE);
                                                                                 
const firm = (a) => 1 - Math.pow(1 - Math.min(1, a), 1.45);

const out = new PNG({ width: w, height: h });
let inked = 0;
for (let i = 0; i < w * h; i++) {
                                                                             
                                                                               
  const solid = Math.max(firm(coverage[i]), 0.28 * firm(spread[i]));
  if (solid > 0.04) {
    inked++;
    const own = coverage[i] > 0;
    out.data[i * 4] = Math.round(Math.min(255, own ? color[i * 3] : spreadColor[i * 3]));
    out.data[i * 4 + 1] = Math.round(Math.min(255, own ? color[i * 3 + 1] : spreadColor[i * 3 + 1]));
    out.data[i * 4 + 2] = Math.round(Math.min(255, own ? color[i * 3 + 2] : spreadColor[i * 3 + 2]));
    out.data[i * 4 + 3] = Math.round(Math.min(1, solid) * 255);
  } else {
    out.data[i * 4 + 3] = 0;
  }
}

fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(out));

console.log(
  `[logo] ${SRC} ${sw}x${sh} -> ${OUT} ${w}x${h} (crop ${cropW}x${cropH}, ${inked} inked px)`
);
