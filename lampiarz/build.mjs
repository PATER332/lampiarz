// Build LAMPIARZ: bundles src/main.tsx with esbuild into dist/ (static site for Vercel).
// Usage: node build.mjs           -> production build
//        node build.mjs --serve   -> dev server with live rebuild at http://localhost:5173
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const serve = process.argv.includes('--serve');
const outdir = 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
if (existsSync('public')) cpSync('public', outdir, { recursive: true });

const options = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outdir: join(outdir, 'assets'),
  entryNames: serve ? 'app' : 'app-[hash]',
  format: 'esm',
  target: ['es2020', 'chrome90', 'firefox90', 'safari15'],
  jsx: 'automatic',
  minify: !serve,
  sourcemap: serve,
  metafile: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': JSON.stringify(serve ? 'development' : 'production') },
  external: ['/fonts/*'],
  logLevel: 'info',
};

function writeHtml(metafile) {
  const outputs = Object.keys(metafile.outputs);
  const js = outputs.find((o) => o.endsWith('.js'));
  const css = outputs.find((o) => o.endsWith('.css'));
  const rel = (p) => '/' + p.replace(/\\/g, '/').replace(/^dist\//, '');
  let html = readFileSync('index.html', 'utf8');
  const tags = [
    css ? `<link rel="stylesheet" href="${rel(css)}">` : '',
    `<script type="module" src="${rel(js)}"></script>`,
  ].join('\n    ');
  html = html.replace('<!--APP-->', tags);
  writeFileSync(join(outdir, 'index.html'), html);
}

if (serve) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{ name: 'html', setup(b) { b.onEnd((r) => r.metafile && writeHtml(r.metafile)); } }],
  });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: outdir, port: 5173 });
  console.log(`\n  LAMPIARZ dev: http://localhost:${port}\n`);
} else {
  const result = await esbuild.build(options);
  writeHtml(result.metafile);
  const size = Object.entries(result.metafile.outputs).reduce((s, [, o]) => s + o.bytes, 0);
  console.log(`Build OK -> ${outdir}/ (${(size / 1024).toFixed(1)} KiB JS+CSS)`);
}
