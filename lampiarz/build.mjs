// EVGAMES build: bundles the platform (src/) and every game in games/<slug>/
// into one static site in dist/, ready for Vercel.
//
//   node build.mjs           production build
//   node build.mjs --watch   rebuild on change (use with `node tools/serve.mjs`)
//
// Layout of dist/:
//   index.html, assets/, img/, fonts/      the platform (single-page app)
//   g/<slug>/index.html, g/<slug>/assets/  each game, built with base path /g/<slug>/

import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const watch = process.argv.includes('--watch');
const OUT = 'dist';
const siteUrl = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const common = {
  bundle: true,
  format: 'esm',
  target: ['es2020', 'chrome90', 'firefox90', 'safari15'],
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch,
  metafile: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  external: ['/fonts/*', '/img/*'],
  logLevel: 'warning',
};

/** Inject hashed bundle tags into an HTML template and rebase absolute asset URLs. */
function emit({ template, outdir, base, metafile, replacements = {} }) {
  const outputs = Object.keys(metafile.outputs);
  const js = outputs.find((o) => o.endsWith('.js'));
  const css = outputs.find((o) => o.endsWith('.css'));
  const url = (p) => base + p.replace(/\\/g, '/').slice(outdir.length + 1);
  if (css && base !== '/') {
    // CSS references fonts as /fonts/...; inside a game they live under its base path
    const cssText = readFileSync(css, 'utf8').replace(/url\(\/fonts\//g, `url(${base}fonts/`);
    writeFileSync(css, cssText);
  }
  let html = readFileSync(template, 'utf8');
  if (base !== '/') html = html.replace(/(href|src)="\/(?!\/)/g, `$1="${base}`);
  for (const [k, v] of Object.entries(replacements)) html = html.split(k).join(v);
  const tags = [css ? `<link rel="stylesheet" href="${url(css)}">` : '', `<script type="module" src="${url(js)}"></script>`].join('\n    ');
  writeFileSync(join(outdir, 'index.html'), html.replace('<!--APP-->', tags));
}

async function build({ name, entry, template, publicDir, outdir, base, replacements }) {
  mkdirSync(outdir, { recursive: true });
  if (existsSync(publicDir)) cpSync(publicDir, outdir, { recursive: true });
  const options = {
    ...common,
    entryPoints: [entry],
    outdir: join(outdir, 'assets'),
    entryNames: watch ? 'app' : 'app-[hash]',
  };
  if (watch) {
    const ctx = await esbuild.context({
      ...options,
      plugins: [{ name: 'emit', setup: (b) => b.onEnd((r) => r.metafile && emit({ template, outdir, base, metafile: r.metafile, replacements })) }],
    });
    await ctx.watch();
    console.log(`watching ${name}`);
    return 0;
  }
  const result = await esbuild.build(options);
  emit({ template, outdir, base, metafile: result.metafile, replacements });
  return Object.values(result.metafile.outputs).reduce((s, o) => s + o.bytes, 0);
}

// ---------------------------------------------------------------- games
// a game's entry point is src/main.tsx or src/main.ts
const entryOf = (slug) => ['main.tsx', 'main.ts'].map((f) => join('games', slug, 'src', f)).find((f) => existsSync(f));
const games = readdirSync('games', { withFileTypes: true })
  .filter((d) => d.isDirectory() && entryOf(d.name))
  .map((d) => d.name);

for (const slug of games) {
  const root = join('games', slug);
  const bytes = await build({
    name: `game ${slug}`,
    entry: entryOf(slug),
    template: join(root, 'index.html'),
    publicDir: join(root, 'public'),
    outdir: join(OUT, 'g', slug),
    base: `/g/${slug}/`,
  });
  if (!watch) console.log(`✓ game  ${slug.padEnd(12)} ${(bytes / 1024).toFixed(0)} KiB -> ${OUT}/g/${slug}/`);
}

// ---------------------------------------------------------------- platform
const bytes = await build({
  name: 'platform',
  entry: 'src/main.tsx',
  template: 'index.html',
  publicDir: 'public',
  outdir: OUT,
  base: '/',
  replacements: { '%SITE_URL%': siteUrl },
});
if (!watch) console.log(`✓ platform EVGAMES   ${(bytes / 1024).toFixed(0)} KiB -> ${OUT}/`);
