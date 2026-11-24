import { Chess } from 'chess.js';
import './style.css';

const PIECES = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
};
const PIECE_FILES = {
  wk: 'wk', wq: 'wq', wr: 'wr', wb: 'wb', wn: 'wn', wp: 'wp',
  bk: 'bk', bq: 'bq', br: 'br', bb: 'bb', bn: 'bn', bp: 'bp',
};
const $ = (selector) => document.querySelector(selector);
const els = {
  board: $('#board'), moveList: $('#move-list'), moveCount: $('#move-count'),
  side: $('#side-select'), strength: $('#strength-select'), engineState: $('#engine-state'),
  engineCaption: $('#engine-caption'), engineNote: $('#engine-note'), youCaption: $('#you-caption'),
  turnChip: $('#turn-chip'), boardHint: $('#board-hint'), undoYou: $('#undo-you'), undoBot: $('#undo-bot'),
  historyList: $('#history-list'), historyCount: $('#history-count'), toast: $('#toast'),
};

const storageKey = 'stockfish-helper-v1';
const stored = JSON.parse(localStorage.getItem(storageKey) || '{"matches":[]}');
const state = {
  chess: new Chess(), orientation: 'w', userColor: 'w', selected: null,
  worker: null, engineReady: false, thinking: false, gameActive: false, boardThemeAvailable: false,
  replacingBotMove: false, pendingStart: false, pendingResume: false, ignoreBestMove: false, dragFrom: null,
  currentMatch: null, matches: stored.matches || [],
  manualPlyIndexes: new Set(), searchDepth: 12, settingsTab: 'engine', toastTimer: null,
};

function saveMatches() {
  localStorage.setItem(storageKey, JSON.stringify({ matches: state.matches }));
}

function newMatch() {
  state.chess = new Chess();
  state.userColor = els.side.value;
  state.orientation = state.userColor;
  state.selected = null;
  state.gameActive = true;
  state.replacingBotMove = false;
  state.manualPlyIndexes = new Set();
  state.currentMatch = {
    id: crypto.randomUUID(), startedAt: new Date().toISOString(),
    userColor: state.userColor, engine: 'Stockfish', strength: Number(els.strength.value),
    moves: [], result: 'In progress',
  };
  state.matches.unshift(state.currentMatch);
  saveMatches();
  draw();
  if (state.userColor === 'b') requestBotMove();
}

function currentHistory() {
  return state.chess.history({ verbose: true });
}

function syncCurrentMoves() {
  if (!state.currentMatch) return;
  const history = currentHistory();
  state.manualPlyIndexes = new Set([...state.manualPlyIndexes].filter((ply) => ply < history.length));
  state.currentMatch.moves = history.map((move, index) => {
    const uci = `${move.from}${move.to}${move.promotion || ''}`;
    return { san: move.san, uci, color: move.color, label: state.manualPlyIndexes.has(index) ? 'Manual replacement' : '' };
  });
  if (state.chess.isGameOver()) {
    state.currentMatch.result = state.chess.isCheckmate() ? `${state.chess.turn() === 'w' ? 'Black' : 'White'} wins by checkmate` : 'Draw';
  }
  saveMatches();
}

function drawBoard() {
  const files = state.orientation === 'w' ? 'abcdefgh'.split('') : 'hgfedcba'.split('');
  const ranks = state.orientation === 'w' ? '87654321'.split('') : '12345678'.split('');
  const last = currentHistory().at(-1);
  const legalTargets = state.selected ? state.chess.moves({ square: state.selected, verbose: true }).map((m) => m.to) : [];
  els.board.replaceChildren();
  els.board.classList.toggle('themed-board', state.boardThemeAvailable);
  ranks.forEach((rank, ri) => files.forEach((file, fi) => {
    const square = `${file}${rank}`;
    const piece = state.chess.get(square);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.draggable = Boolean(piece);
    cell.className = `square ${(ri + fi) % 2 ? 'dark' : 'light'}${state.selected === square ? ' selected' : ''}${legalTargets.includes(square) ? ' legal-target' : ''}${last && (last.from === square || last.to === square) ? ' last-move' : ''}`;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`);
    cell.dataset.square = square;
    if (fi === 0) cell.dataset.rank = rank;
    if (ri === 7) cell.dataset.file = file;
    if (piece) {
      const key = piece.color + piece.type;
      const image = document.createElement('img');
      image.className = 'piece-image';
      image.alt = '';
      image.src = `/assets/ejgfv/${PIECE_FILES[key]}.png`;
      image.onerror = () => {
        const fallback = document.createElement('span');
        fallback.className = `piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`;
        fallback.textContent = PIECES[key];
        image.replaceWith(fallback);
      };
      cell.append(image);
    }
    cell.addEventListener('click', () => onSquareClick(square));
    cell.addEventListener('dragstart', (event) => {
      if (!canMoveForCurrentSide() || !piece || piece.color !== state.chess.turn()) {
        event.preventDefault();
        return;
      }
      state.dragFrom = square;
      state.selected = square;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', square);
      cell.classList.add('selected');
    });
    cell.addEventListener('dragover', (event) => {
      if (state.dragFrom) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        cell.classList.add('drag-over');
      }
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', (event) => {
      event.preventDefault();
      cell.classList.remove('drag-over');
      const from = event.dataTransfer.getData('text/plain') || state.dragFrom;
      state.dragFrom = null;
      if (from && from !== square && !playMove(from, square)) {
        state.selected = null;
        drawBoard();
      }
    });
    cell.addEventListener('dragend', () => {
      cell.classList.remove('drag-over');
      state.dragFrom = null;
    });
    els.board.append(cell);
  }));
}

function drawMoves() {
  const history = currentHistory();
  els.moveCount.textContent = String(history.length);
  if (!history.length) {
    els.moveList.innerHTML = '<div class="empty-moves"><span>♘</span><p>Your moves will appear here.</p></div>';
    return;
  }
  const movesByPly = [];
  for (let i = 0; i < history.length; i += 2) movesByPly.push([history[i], history[i + 1]]);
  els.moveList.innerHTML = movesByPly.map(([white, black], i) => {
    const render = (move, ply) => move ? `<span class="${ply === history.length - 1 ? 'current-san' : ''}">${move.san}${state.manualPlyIndexes.has(ply) ? '<small class="move-label">Manual replacement</small>' : ''}</span>` : '<span class="move-placeholder">—</span>';
    return `<div class="move-row"><span class="move-number">${i + 1}.</span>${render(white, i * 2)}${render(black, i * 2 + 1)}</div>`;
  }).join('');
  els.moveList.scrollTop = els.moveList.scrollHeight;
}

function drawHistory() {
  els.historyCount.textContent = String(Math.max(0, state.matches.length - (state.currentMatch ? 1 : 0)));
  const pastMatches = state.matches.filter((match) => match.id !== state.currentMatch?.id);
  if (!pastMatches.length) {
    els.historyList.innerHTML = '<p class="history-empty">Completed and saved matches show up here.</p>';
    return;
  }
  els.historyList.innerHTML = pastMatches.map((match) => `<button class="history-item" data-match="${match.id}"><span class="history-icon">♞</span><span class="history-info"><strong>${new Date(match.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${match.userColor === 'w' ? 'White' : 'Black'}</strong><small>${match.moves.length} half-moves · ${escapeHtml(match.result || 'Saved match')}</small></span><span class="history-chevron">›</span></button>`).join('');
  els.historyList.querySelectorAll('[data-match]').forEach((button) => button.addEventListener('click', () => loadMatch(button.dataset.match)));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function drawStatus() {
  const turn = state.chess.turn();
  const userTurn = turn === state.userColor && state.gameActive && !state.replacingBotMove;
  els.youCaption.textContent = `${state.userColor === 'w' ? 'White' : 'Black'} · ${userTurn ? 'your turn' : state.thinking ? 'engine thinking…' : 'waiting'}`;
  els.turnChip.textContent = state.replacingBotMove ? 'CHOOSE BOT MOVE' : userTurn ? 'YOUR TURN' : state.thinking ? 'THINKING' : 'BOT TURN';
  els.turnChip.className = `turn-chip${state.replacingBotMove ? ' replace-chip' : userTurn ? '' : ' idle-chip'}`;
  els.engineState.textContent = state.engineReady ? (state.thinking ? 'THINKING' : 'READY') : 'OFF';
  els.engineState.className = `engine-state${state.engineReady ? ' engine-on' : ''}${state.thinking ? ' engine-thinking' : ''}`;
  els.engineCaption.textContent = state.engineReady ? `Stockfish · ${state.thinking ? 'thinking' : 'ready'}` : 'Stockfish · not loaded';
  els.undoYou.disabled = !state.gameActive || !historyHasUserMove();
  els.undoBot.disabled = !state.gameActive || !historyHasBotMove();
  $('#stop-button').disabled = !state.thinking;
  els.undoBot.classList.toggle('undo-highlight', state.replacingBotMove);
}

function draw() {
  drawBoard(); drawMoves(); drawStatus(); drawHistory();
}

function historyHasUserMove() {
  return currentHistory().some((move) => move.color === state.userColor);
}
function historyHasBotMove() {
  return currentHistory().some((move) => move.color !== state.userColor);
}

function promotionChoice() {
  const answer = window.prompt('Promote pawn to: queen, rook, bishop, or knight', 'queen')?.toLowerCase();
  const aliases = { q: 'q', queen: 'q', r: 'r', rook: 'r', b: 'b', bishop: 'b', n: 'n', knight: 'n' };
  return aliases[answer || 'queen'] || 'q';
}

function canMoveForCurrentSide() {
  return state.gameActive && !state.thinking && !state.chess.isGameOver()
    && (state.chess.turn() === state.userColor || state.replacingBotMove);
}

function playMove(from, to) {
  if (!canMoveForCurrentSide()) return false;
  const matching = state.chess.moves({ square: from, verbose: true }).filter((move) => move.to === to);
  if (!matching.length) return false;
  const options = { from, to };
  if (matching.some((move) => move.flags.includes('p'))) options.promotion = promotionChoice();
  try {
    state.chess.move(options);
    if (state.replacingBotMove) state.manualPlyIndexes.add(currentHistory().length - 1);
    state.replacingBotMove = false;
    state.selected = null;
    syncCurrentMoves();
    draw();
    if (!state.chess.isGameOver() && state.chess.turn() !== state.userColor) requestBotMove();
    else if (state.chess.isGameOver()) showToast(state.currentMatch.result);
    return true;
  } catch {
    return false;
  }
}

function onSquareClick(square) {
  if (!canMoveForCurrentSide()) return;
  const sideToMove = state.chess.turn();
  const piece = state.chess.get(square);
  if (!state.selected) {
    if (piece?.color === sideToMove) { state.selected = square; drawBoard(); }
    return;
  }
  if (piece?.color === sideToMove) { state.selected = square; drawBoard(); return; }
  if (!playMove(state.selected, square)) { state.selected = null; drawBoard(); }
}

function loadEngine() {
  if (state.worker) return;
  const worker = new Worker('/engine/stockfish-19-lite-single.js');
  state.worker = worker;
  worker.addEventListener('message', (event) => {
    const line = typeof event.data === 'string' ? event.data : '';
    if (line === 'uciok') {
      state.engineReady = true;
      worker.postMessage('setoption name Skill Level value ' + Number(els.strength.value));
      worker.postMessage('isready');
      els.engineNote.textContent = 'Stockfish is ready. Choose a side and start a new game.';
      drawStatus();
      if (state.pendingStart) {
        state.pendingStart = false;
        newMatch();
      } else if (state.pendingResume) {
        state.pendingResume = false;
        if (state.chess.turn() !== state.userColor) requestBotMove();
      }
    } else if (line === 'readyok') {
      drawStatus();
    } else if (line.startsWith('bestmove')) {
      if (state.ignoreBestMove) {
        state.ignoreBestMove = false;
        state.thinking = false;
        drawStatus();
        return;
      }
      state.thinking = false;
      const uci = line.split(/\s+/)[1];
      if (state.gameActive && uci && uci !== '(none)') {
        const from = uci.slice(0, 2); const to = uci.slice(2, 4); const promotion = uci[4];
        try {
          state.chess.move({ from, to, ...(promotion ? { promotion } : {}) });
          syncCurrentMoves();
        } catch { showToast('The engine returned an invalid move.'); }
      }
      draw();
    } else if (line.startsWith('info depth')) {
      const depth = line.match(/\bdepth (\d+)/)?.[1];
      if (depth) els.engineCaption.textContent = `Stockfish · depth ${depth}`;
    }
  });
  worker.addEventListener('error', () => {
    state.engineReady = false; state.thinking = false;
    els.engineNote.textContent = 'Could not load Stockfish. Open Settings → Engine and download the engine files.';
    drawStatus();
  });
  worker.postMessage('uci');
}

function requestBotMove() {
  if (!state.worker || !state.engineReady || state.thinking || state.chess.isGameOver()) return;
  state.thinking = true;
  state.replacingBotMove = false;
  state.worker.postMessage(`setoption name Skill Level value ${Number(els.strength.value)}`);
  state.worker.postMessage(`position fen ${state.chess.fen()}`);
  state.worker.postMessage(`go depth ${state.searchDepth}`);
  drawStatus();
}

function cancelSearch() {
  if (state.worker && state.thinking) {
    state.ignoreBestMove = true;
    state.worker.postMessage('stop');
  }
  state.thinking = false;
}

function undoMyMove() {
  if (!state.gameActive) return;
  cancelSearch();
  let undoneUser = false;
  while (state.chess.history().length) {
    const move = state.chess.undo();
    if (!move) break;
    if (move.color === state.userColor) { undoneUser = true; break; }
  }
  if (!undoneUser) return;
  state.replacingBotMove = false;
  state.selected = null;
  syncCurrentMoves(); draw();
  if (state.chess.turn() !== state.userColor) requestBotMove();
}

function undoBotMove() {
  if (!state.gameActive) return;
  cancelSearch();
  let undoneBot = false;
  while (state.chess.history().length) {
    const move = state.chess.undo();
    if (!move) break;
    if (move.color !== state.userColor) { undoneBot = true; break; }
  }
  if (!undoneBot || state.chess.turn() === state.userColor) {
    showToast('Make a move first, then undo the bot reply.');
    return;
  }
  state.replacingBotMove = true;
  state.selected = null;
  syncCurrentMoves(); draw();
}

function loadMatch(id) {
  const match = state.matches.find((item) => item.id === id);
  if (!match) return;
  const chess = new Chess();
  for (const savedMove of match.moves) {
    const uci = savedMove.uci || '';
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
    if (move && savedMove.label) move.manual = true;
  }
  state.chess = chess;
  state.userColor = match.userColor;
  state.orientation = match.userColor;
  state.currentMatch = match;
  state.manualPlyIndexes = new Set(match.moves.map((item, index) => item.label ? index : -1).filter((index) => index >= 0));
  state.gameActive = true;
  state.replacingBotMove = false;
  state.pendingResume = !state.engineReady;
  els.side.value = match.userColor;
  els.strength.value = String(match.strength || 12);
  draw();
  if (!state.engineReady) loadEngine();
  else if (state.chess.turn() !== state.userColor) requestBotMove();
  showToast('Match loaded.');
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.remove('visible'), 2500);
}

function renderSettings(tab = state.settingsTab) {
  state.settingsTab = tab;
  document.querySelectorAll('.settings-tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  const content = $('#settings-content');
  if (tab === 'engine') content.innerHTML = `<div class="setting-block"><span class="setting-icon">♟</span><div class="setting-copy"><strong>Stockfish 19 · Lite</strong><p>Fast local engine for browser play. Engine files are downloaded once and stay on your computer.</p><label class="setting-select-label">Search depth<select id="depth-select"><option value="8">8 · faster replies</option><option value="12">12 · balanced</option><option value="16">16 · deeper search</option><option value="20">20 · longest search</option></select></label><button id="download-engine" class="primary-button small-button">Download Stockfish files</button><p id="download-status" class="download-status"></p></div></div><div class="setting-block"><span class="setting-icon">◉</span><div class="setting-copy"><strong>Other engines</strong><p>Leela Chess Zero and Maia are planned engine choices. They are not connected in this first version.</p></div><span class="coming-soon">PLANNED</span></div><div class="privacy-note"><span>●</span><p>Moves, settings, and saved matches stay in this browser. No paid service or API key is used.</p></div>`;
  if (tab === 'game') content.innerHTML = `<div class="setting-row"><div><strong>Board theme</strong><p>Green board · Neo pieces, loaded from your local assets folder.</p></div><span class="setting-check">✓</span></div><div class="setting-row"><div><strong>Board orientation</strong><p>Flip the board without changing your side in the game.</p></div><button id="settings-flip" class="subtle-button">⇅ Flip</button></div><div class="setting-row"><div><strong>Move replacement</strong><p>Undo a bot move to choose a different legal move for its side. The previous continuation is discarded.</p></div><span class="setting-check">✓</span></div><div class="setting-row"><div><strong>Match history</strong><p>Saved locally in this browser.</p></div><span class="setting-check">✓</span></div>`;
  if (tab === 'about') content.innerHTML = `<div class="about-card"><span class="about-knight">♞</span><h3>Chess on your terms.</h3><p>A local chess game with configurable engines, flexible sides, and editable continuations.</p><span class="version-label">EARLY BUILD · 0.1.0</span></div><div class="license-note"><strong>Engine license</strong><p>Stockfish is distributed under GPL-3.0. The app downloads the engine from its published package and does not include the engine binary in this repository.</p></div>`;
  $('#download-engine')?.addEventListener('click', async () => {
    const status = $('#download-status');
    status.textContent = 'Downloading Stockfish locally…';
    const response = await fetch('/api/download-engine', { method: 'POST' }).catch(() => null);
    if (!response?.ok) { status.textContent = 'Start the local app, then run: npm run download:engine'; return; }
    status.textContent = 'Download complete. Refresh the page to load Stockfish.';
  });
  const depthSelect = $('#depth-select');
  if (depthSelect) {
    depthSelect.value = String(state.searchDepth);
    depthSelect.addEventListener('change', () => { state.searchDepth = Number(depthSelect.value); });
  }
  $('#settings-flip')?.addEventListener('click', () => { state.orientation = state.orientation === 'w' ? 'b' : 'w'; drawBoard(); });
}

function bindEvents() {
  $('#start-button').addEventListener('click', () => {
    if (!state.engineReady) {
      state.pendingStart = true;
      loadEngine();
      showToast('Loading the local engine…');
      return;
    }
    newMatch();
  });
  $('#new-game').addEventListener('click', () => {
    if (!state.engineReady) { showToast('Load Stockfish first from Settings.'); return; }
    newMatch();
  });
  $('#stop-button').addEventListener('click', () => { if (state.thinking) state.worker?.postMessage('stop'); });
  $('#flip-button').addEventListener('click', () => { state.orientation = state.orientation === 'w' ? 'b' : 'w'; drawBoard(); });
  els.undoYou.addEventListener('click', undoMyMove);
  els.undoBot.addEventListener('click', undoBotMove);
  $('#settings-open').addEventListener('click', () => { renderSettings(); $('#settings-overlay').hidden = false; });
  $('#settings-close').addEventListener('click', () => { $('#settings-overlay').hidden = true; });
  $('#settings-overlay').addEventListener('click', (event) => { if (event.target === $('#settings-overlay')) $('#settings-overlay').hidden = true; });
  document.querySelectorAll('.settings-tab').forEach((button) => button.addEventListener('click', () => renderSettings(button.dataset.tab)));
  els.side.addEventListener('change', () => { if (!state.gameActive) { state.orientation = els.side.value; draw(); } });
  $('#resize-handle').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startX = event.clientX; const startWidth = els.board.getBoundingClientRect().width;
    const move = (pointerEvent) => {
      const width = Math.min(Math.max(startWidth + pointerEvent.clientX - startX, 280), Math.min(window.innerWidth - 24, window.innerHeight - 170));
      document.documentElement.style.setProperty('--board-size', `${width}px`);
    };
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
  });
}

bindEvents();
els.boardHint.textContent = 'Drag a piece, or click a piece and target square';
const boardImage = new Image();
boardImage.onload = () => { state.boardThemeAvailable = true; els.board.style.backgroundImage = 'url("/assets/9rdwe.png")'; drawBoard(); };
boardImage.onerror = () => { state.boardThemeAvailable = false; els.board.style.backgroundImage = ''; drawBoard(); };
boardImage.src = '/assets/9rdwe.png';
draw();

