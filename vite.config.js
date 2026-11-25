import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { defineConfig } from 'vite';

let maiaEngine = null;
let maiaElo = null;
let maiaQueue = Promise.resolve();

function waitForLine(engine, pattern, write, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Maia engine timed out while loading or thinking.')); }, timeoutMs);
    const onLine = (line) => {
      if (!pattern.test(line)) return;
      cleanup(); resolve(line);
    };
    const onError = (error) => { cleanup(); reject(error); };
    const onExit = (code) => { cleanup(); reject(new Error(`Maia engine exited (${code ?? 'unknown'}).`)); };
    const cleanup = () => {
      clearTimeout(timer); engine.lines.off('line', onLine); engine.child.off('error', onError); engine.child.off('exit', onExit);
    };
    engine.lines.on('line', onLine); engine.child.once('error', onError); engine.child.once('exit', onExit);
    write();
  });
}

async function getMaiaEngine(elo) {
  if (maiaEngine && maiaElo === elo && maiaEngine.child.exitCode === null) return maiaEngine;
  maiaEngine?.child.kill(); maiaEngine = null; maiaElo = null;
  const child = spawn('maia3-uci', ['--model', 'maia3-5m', '--use-uci-history', '--elo', String(elo)], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = new EventEmitter();
  let pending = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    pending += chunk;
    const parts = pending.split(/\r?\n/); pending = parts.pop() || '';
    parts.forEach((line) => lines.emit('line', line));
  });
  let startupError = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { startupError += chunk; });
  const engine = { child, lines };
  try {
    await waitForLine(engine, /^uciok$/, () => child.stdin.write('uci\n'));
    await waitForLine(engine, /^readyok$/, () => child.stdin.write('isready\n'));
  } catch (error) {
    child.kill();
    throw new Error(startupError.trim() || `${error.message} Install Maia-3 using the Engine settings instructions.`);
  }
  maiaEngine = engine; maiaElo = elo;
  return engine;
}

async function getMaiaMove(fen, elo) {
  const engine = await getMaiaEngine(elo);
  const line = await waitForLine(engine, /^bestmove\s+(\S+)/, () => {
    engine.child.stdin.write(`position fen ${fen}\n`);
    engine.child.stdin.write('go depth 1\n');
  });
  return line.match(/^bestmove\s+(\S+)/)?.[1];
}

function localMaiaBridge() {
  return {
    name: 'local-maia-bridge',
    configureServer(server) {
      server.httpServer?.once('close', () => maiaEngine?.child.kill());
      server.middlewares.use('/api/maia/move', (request, response, next) => {
        if (request.method !== 'POST') return next();
        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk) => { body += chunk; if (body.length > 10000) request.destroy(); });
        request.on('end', () => {
          let payload;
          try { payload = JSON.parse(body); } catch { response.writeHead(400).end('Invalid request'); return; }
          const elo = Number(payload.elo);
          if (typeof payload.fen !== 'string' || !Number.isFinite(elo) || elo < 400 || elo > 2800) {
            response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid Maia position or rating.' })); return;
          }
          const task = maiaQueue.then(() => getMaiaMove(payload.fen, elo));
          maiaQueue = task.catch(() => {});
          task.then((move) => {
            if (!move || move === '(none)') throw new Error('Maia returned no move.');
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ move }));
          }).catch((error) => {
            response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }));
          });
        });
      });
    },
    closeBundle() { maiaEngine?.child.kill(); },
  };
}

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

export default defineConfig({ plugins: [localEngineDownload(), localMaiaBridge()] });

