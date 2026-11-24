import { spawn } from 'node:child_process';
import { defineConfig } from 'vite';

function localEngineDownload() {
  return {
    name: 'local-engine-download',
    configureServer(server) {
      server.middlewares.use('/api/download-engine', (request, response, next) => {
        if (request.method !== 'POST') return next();
        const child = spawn(process.execPath, ['scripts/download-engine.mjs'], {
          cwd: process.cwd(), windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let errorText = '';
        child.stderr.on('data', (chunk) => { errorText += chunk.toString(); });
        child.on('error', (error) => {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: error.message }));
        });
        child.on('close', (code) => {
          if (response.writableEnded) return;
          response.writeHead(code === 0 ? 200 : 500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(code === 0 ? { ok: true } : { error: errorText || 'Engine download failed.' }));
        });
      });
    },
  };
}

export default defineConfig({ plugins: [localEngineDownload()] });

