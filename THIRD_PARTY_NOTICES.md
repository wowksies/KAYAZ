# Third-party notices

## React Bits

The animated storefront background and cards are built from React Bits
components (https://reactbits.dev):

- **CRTWarp** - `src/crt-warp.js` (upstream React component ported to a plain DOM
  mount; shaders, uniforms and defaults unchanged), bundled to
  `assets/crt-warp.js`. The port draws through `ogl` rather than `three`, which
  this site already bundles, so no second WebGL library ships to the browser.
- **PixelCard** - `src/pixel-card.js` (upstream React component ported to a plain
  DOM mount; pixel class, variant table and defaults unchanged), bundled to
  `assets/pixel-card.js`
- **TechText** - `src/tech-text.js` (upstream React component ported to a plain
  DOM mount; glyph layout, dash outlines, specks, selection frame, drag springs
  and every default unchanged), bundled to `assets/tech-text.js`. It draws the
  storefront slogan and the profile page wordmark.

Licence: **MIT + Commons Clause License Condition v1.0**

```
Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software as part of an
application, website, or product, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, so long as you
do not sell, sublicense, or redistribute the components themselves - whether
alone, in a bundle, or as a ported version.

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The Commons Clause means the effect is used here as part of this site and is not
resold or redistributed as a component.

## npm packages

Bundled into `assets/crt-warp.js`: `ogl` (MIT). The TechText and PixelCard
bundles have no dependencies.

Dev tooling only: `esbuild` (MIT), `pngjs` (MIT).
