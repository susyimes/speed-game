import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'three/addons/libs/fflate.module.js';

// Serve the upload ZIP itself under a nested URL, without SPA fallbacks.
const files = unzipSync(readFileSync(fileURLToPath(new URL('../dist-toy/godspeed-toy.zip', import.meta.url))));
const prefix = '/toy-fixture/';
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', data: 'application/octet-stream', ogg: 'audio/ogg', mp3: 'audio/mpeg', md: 'text/plain; charset=utf-8' };
createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
  const name = url.pathname.slice(prefix.length) || 'index.html';
  if (!Object.hasOwn(files, name)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[name.split('.').pop()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(files[name]);
}).listen(Number(process.env.TOY_PREVIEW_PORT ?? 5199), '127.0.0.1', function () {
  console.log('Toy ZIP preview: http://127.0.0.1:' + this.address().port + prefix);
});
