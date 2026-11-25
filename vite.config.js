import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const { createMaiaUci } = require('./desktop/maia-uci.cjs');
const maia = createMaiaUci({ projectRoot: fileURLToPath(new URL('.', import.meta.url)) });

function localMaiaBridge() {
  return {
    name: 'local-maia-bridge',
    configureServer(server) {
      server.httpServer?.once('close', () => maia.close());
      server.middlewares.use('/api/maia/move', (request, response, next) => {
        if (request.method !== 'POST') return next();
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
          if (typeof payload.fen !== 'string' || !Number.isFinite(elo) || elo < 400 || elo > 2800) {
            response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid Maia position or rating.' }));
            return;
          }
          try {
            const move = await maia.getMove(payload.fen, elo, payload.startFen, payload.moves);
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ move }));
          } catch (error) {
            response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }));
          }
        });
      });
    },
    closeBundle() { maia.close(); },
  };
}

export default defineConfig({ plugins: [localMaiaBridge()] });
