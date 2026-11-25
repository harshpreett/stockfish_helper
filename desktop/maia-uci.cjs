const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

function waitForLine(engine, pattern, write, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Maia timed out while loading or choosing a move.')); }, timeoutMs);
    const onLine = (line) => { if (pattern.test(line)) { cleanup(); resolve(line); } };
    const onError = (error) => { cleanup(); reject(error); };
    const onExit = (code) => { cleanup(); reject(new Error(`Maia exited with code ${code ?? 'unknown'}.`)); };
    const cleanup = () => {
      clearTimeout(timer);
      engine.lines.off('line', onLine);
      engine.child.off('error', onError);
      engine.child.off('exit', onExit);
    };
    engine.lines.on('line', onLine);
    engine.child.once('error', onError);
    engine.child.once('exit', onExit);
    write();
  });
}

function createMaiaUci({ projectRoot = process.cwd(), resourcesPath = null } = {}) {
  let active = null;
  let queue = Promise.resolve();

  function launchOptions(elo) {
    const checkpointBase = resourcesPath || projectRoot;
    const checkpoint = path.join(checkpointBase, 'models', 'maia3-5m.pt');
    const args = ['--model', 'maia3-5m', '--checkpoint-path', checkpoint, '--use-uci-history', '--elo', String(elo), '--device', 'cpu', '--no-use-amp'];
    const bundled = resourcesPath && path.join(resourcesPath, 'maia', 'maia3-uci.exe');
    if (bundled && fs.existsSync(bundled)) return [{ command: bundled, args }];

    const configured = process.env.MAIA3_UCI_EXECUTABLE;
    if (configured) return [{ command: configured, args }];
    if (process.env.MAIA3_PYTHON) return [{ command: process.env.MAIA3_PYTHON, args: ['-m', 'maia3.uci', ...args] }];

    if (process.platform === 'win32') {
      return [
        { command: 'python', args: ['-m', 'maia3.uci', ...args] },
        { command: 'py', args: ['-3', '-m', 'maia3.uci', ...args] },
        { command: 'maia3-uci', args },
      ];
    }
    return [
      { command: 'python3', args: ['-m', 'maia3.uci', ...args] },
      { command: 'maia3-uci', args },
    ];
  }

  async function launch(elo) {
    active?.child.kill();
    active = null;
    const errors = [];
    for (const candidate of launchOptions(elo)) {
      const child = spawn(candidate.command, candidate.args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const lines = new EventEmitter();
      let pending = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        pending += chunk;
        const parts = pending.split(/\r?\n/);
        pending = parts.pop() || '';
        parts.forEach((line) => lines.emit('line', line));
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      const engine = { child, lines };
      try {
        await waitForLine(engine, /^uciok$/, () => child.stdin.write('uci\n'));
        await waitForLine(engine, /^readyok$/, () => child.stdin.write('isready\n'));
        active = { ...engine, elo };
        return active;
      } catch (error) {
        child.kill();
        errors.push(stderr.trim() || `${candidate.command}: ${error.message}`);
      }
    }
    throw new Error(errors.at(-1) || 'Could not find a working Maia engine.');
  }

  async function getEngine(elo) {
    if (active && active.elo === elo && active.child.exitCode === null) return active;
    return launch(elo);
  }

  function getMove(fen, elo, startFen, moves = []) {
    const safeFen = typeof fen === 'string' && fen.length < 160 && fen.trim().split(/\s+/).length === 6 && !/[\r\n]/.test(fen);
    const safeStartFen = typeof startFen === 'string' && startFen.length < 160 && startFen.trim().split(/\s+/).length === 6 && !/[\r\n]/.test(startFen);
    const safeMoves = Array.isArray(moves) && moves.length <= 500 && moves.every((move) => typeof move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move));
    if (!safeFen || !safeStartFen || !safeMoves) return Promise.reject(new Error('Invalid FEN or move history for Maia.'));
    const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const base = startFen === initialFen ? 'startpos' : `fen ${startFen}`;
    const position = `position ${base}${moves.length ? ` moves ${moves.join(' ')}` : ''}`;
    const task = queue.then(async () => {
      const engine = await getEngine(elo);
      const best = await waitForLine(engine, /^bestmove\s+(\S+)/, () => {
        engine.child.stdin.write(`${position}\n`);
        engine.child.stdin.write('go depth 1\n');
      });
      const move = best.match(/^bestmove\s+(\S+)/)?.[1];
      if (!move || move === '(none)') throw new Error('Maia returned no legal move.');
      return move;
    });
    queue = task.catch(() => {});
    return task;
  }

  return { getMove, close() { active?.child.kill(); active = null; } };
}

module.exports = { createMaiaUci };
