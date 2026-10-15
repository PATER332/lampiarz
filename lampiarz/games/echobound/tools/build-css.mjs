// Kompiluje style gry (Tailwind CSS v4) do zwykłego pliku src/index.css.
// Uruchom po zmianie klas Tailwinda w komponentach:
//   npx -y -p tailwindcss@4 node games/echobound/tools/build-css.mjs
// (albo z zainstalowanym pakietem tailwindcss@4 w node_modules).
// Wynik jest commitowany, więc build EVGAMES (esbuild) nie potrzebuje Tailwinda.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');
const require = createRequire(process.env.TAILWIND_FROM ? join(process.env.TAILWIND_FROM, 'x.js') : import.meta.url);
const twPkg = dirname(require.resolve('tailwindcss/package.json'));
const { compile } = await import(join(twPkg, 'dist', 'lib.mjs'));

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.(tsx?|html)$/.test(f) && files.push(join(d, f))));
walk(src);
files.push(join(here, '..', 'index.html'));
const candidates = new Set();
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  // whole tokens (keeps arbitrary values such as drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]) and finer pieces
  for (const re of [/[\s"'`{}]+/, /[\s"'`{}()<>,;]+/]) for (const t of text.split(re)) if (t && t.length < 160) candidates.add(t);
}

const input = readFileSync(join(src, 'styles.tailwind.css'), 'utf8');
const compiler = await compile(input, {
  base: src,
  loadStylesheet: async (id, base) => {
    const p = id === 'tailwindcss' ? join(twPkg, 'index.css') : id.startsWith('tailwindcss/') ? join(twPkg, id.slice(12) + (id.endsWith('.css') ? '' : '.css')) : join(base, id);
    return { path: p, base: dirname(p), content: readFileSync(p, 'utf8') };
  },
});
const css = compiler.build([...candidates]);
writeFileSync(join(src, 'index.css'), '/* PLIK GENEROWANY z styles.tailwind.css przez tools/build-css.mjs — nie edytuj ręcznie. */\n' + css);
console.log(`index.css: ${(css.length / 1024).toFixed(1)} KiB z ${candidates.size} kandydatów, ${files.length} plików`);
