/**
 * Bundles the storefront's background effect into a plain <script> file the
 * static page can load. Output is committed, so the site keeps deploying with
 * no build step.
 *
 * Run: npm run build-effects
 */
import esbuild from 'esbuild';

const banner = {
  js: '/*! KAYAZ storefront background. EvilEye is adapted from React Bits, reactbits.dev - MIT + Commons Clause, (c) 2026 David Haz. See THIRD_PARTY_NOTICES.md */'
};

await esbuild.build({
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  banner,
  logLevel: 'info',
  entryPoints: ['src/evil-eye.js'],
  outfile: 'assets/evil-eye.js'
});
