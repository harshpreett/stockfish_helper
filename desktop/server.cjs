const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createMaiaUci } = require('./maia-uci.cjs');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ico': 'image/x-icon',
};

function startLocalServer({ root, resourcesPath }) {
  const webRoot = path.join(root, 'dist');
  const maia = createMaiaUci({ projectRoot: root, resourcesPath });
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/maia/move') {
      if (request.method !== 'POST') { response.writeHead(405).end(); return; }
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
        if (body.length > 10000) { response.writeHead(413).end('Request too large'); request.destroy(); }
      });
      request.on('end', async () => {
        let payload;
        try { payload = JSON.parse(body); } catch { response.writeHead(400).end('Invalid request'); return; }
        const elo = Number(payload.elo);
        if (!Number.isFinite(elo) || elo < 400 || elo > 2800) {
          response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid Maia rating.' }));
          return;
        }
        try {
          const move = await maia.getMove(payload.fen, elo, payload.startFen, payload.moves);
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ move }));
        } catch (error) {
          response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400).end(); return; }
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.resolve(webRoot, `.${pathname}`);
    if (!filePath.startsWith(`${path.resolve(webRoot)}${path.sep}`)) { response.writeHead(403).end(); return; }
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'",
      });
      if (request.method === 'HEAD') { response.end(); return; }
      fs.createReadStream(filePath).pipe(response);
    } catch { response.writeHead(404).end(); }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close() { maia.close(); server.close(); },
      });
    });
  });
}

module.exports = { startLocalServer };
