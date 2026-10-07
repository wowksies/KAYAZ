/**
 * Bundles the storefront's visual effects into plain <script> files the static
 * pages can load. Output is committed, so the site keeps deploying with no
 * build step.
 *
 * Run: npm run build-effects
 */
import esbuild from 'esbuild';

const effects = [
  {
    entry: 'src/crt-warp.js',
    outfile: 'assets/crt-warp.js',
    component: 'CRTWarp'
  },
  {
    entry: 'src/pixel-card.js',
    outfile: 'assets/pixel-card.js',
    component: 'PixelCard'
  },
  {
    entry: 'src/tech-text.js',
    outfile: 'assets/tech-text.js',
    component: 'TechText'
  }
];

for (const effect of effects) {
  await esbuild.build({
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020'],
    legalComments: 'none',
    logLevel: 'info',
    entryPoints: [effect.entry],
    outfile: effect.outfile,
    banner: {
      js: `/*! KAYAZ storefront effect. ${effect.component} is adapted from React Bits, reactbits.dev - MIT + Commons Clause, (c) 2026 David Haz. See THIRD_PARTY_NOTICES.md */`
    }
  });
}
