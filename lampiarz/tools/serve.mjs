// Local static server that mimics the Vercel setup in vercel.json:
// existing files are served as-is, /g/* misses are real 404s, every other
// path falls back to the platform's index.html (client-side routing).
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = 'dist';
const port = Number(process.env.PORT || 4321);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) return res.writeHead(400).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    if (/^\/(g|assets|img|fonts)\//.test(path)) return res.writeHead(404, { 'content-type': 'text/plain' }).end('404');
    file = join(root, 'index.html');
  }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'x-frame-options': 'SAMEORIGIN' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`EVGAMES: http://localhost:${port}`));
