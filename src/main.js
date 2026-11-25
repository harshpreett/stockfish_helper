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
  side: $('#side-select'), strength: $('#strength-select'), model: $('#model-select'), engineState: $('#engine-state'),
  engineCaption: $('#engine-caption'), engineNote: $('#engine-note'), youCaption: $('#you-caption'),
  turnChip: $('#turn-chip'), boardHint: $('#board-hint'), undoYou: $('#undo-you'), undoBot: $('#undo-bot'),
  historyList: $('#history-list'), historyCount: $('#history-count'), toast: $('#toast'),
  timeControl: $('#time-control'), clockBot: $('#clock-bot'), clockYou: $('#clock-you'),
  analysisScore: $('#analysis-score'), evaluationFill: $('#evaluation-fill'), candidates: $('#candidate-lines'),
  reviewStatus: $('#review-status'), replayReturn: $('#return-live'), historySearch: $('#history-search'),
  arrows: $('#arrow-lines'), matchSummary: $('#match-summary'),
};

const storageKey = 'stockfish-helper-v1';
let stored = {};
try { stored = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { stored = {}; }
const savedSettings = stored.settings || {};
const state = {
  chess: new Chess(), orientation: 'w', userColor: 'w', selected: null,
  worker: null, engineReady: false, thinking: false, gameActive: false, maiaAbort: null, boardThemeAvailable: false,
  replacingBotMove: false, pendingStart: false, pendingResume: false, pendingHint: false, hintActive: false, ignoreBestMove: false, dragFrom: null,
  currentMatch: null, matches: Array.isArray(stored.matches) ? stored.matches : [],
  manualPlyIndexes: new Set(), searchDepth: Number(savedSettings.searchDepth) || 12,
  orientationPref: savedSettings.orientation || 'w', timeControl: savedSettings.timeControl || '0+0',
  analysisLines: [], analysisScore: null, analysisFen: null, engineTask: null, pendingAnalysis: false, pendingReview: false, pendingAnalysis: false, pendingReview: false,
  reviewIndex: 0, reviewPositions: [], reviewScores: [], replayPly: null,
  clockTimer: null, clockLastTick: null, clockPaused: false, clockSaveAt: 0,
  settingsTab: 'engine', toastTimer: null,
};

function saveApp() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      matches: state.matches,
      activeMatchId: state.currentMatch?.result === 'In progress' ? state.currentMatch.id : null,
      settings: {
        side: els.side.value, model: els.model.value, strength: Number(els.strength.value), searchDepth: state.searchDepth,
        timeControl: state.timeControl, orientation: state.orientation,
      },
    }));
  } catch { showToast('Could not save match data. Browser storage may be full.'); }
}

function newMatch(startFen = new Chess().fen()) {
  try { state.chess = new Chess(startFen); }
  catch { showToast('That FEN position is invalid.'); return; }
  state.userColor = els.side.value;
  state.orientation = state.orientationPref === 'auto' ? state.userColor : state.orientationPref;
  state.selected = null;
  state.gameActive = true;
  showGame();
  state.replacingBotMove = false;
  state.replayPly = null;
  state.manualPlyIndexes = new Set();
  const timeControl = parseTimeControl(els.timeControl.value);
  state.currentMatch = {
    id: crypto.randomUUID(), startedAt: new Date().toISOString(),
    userColor: state.userColor, model: els.model.value, engine: els.model.value === 'maia3' ? 'Maia' : 'Stockfish', strength: Number(els.strength.value),
    searchDepth: state.searchDepth, timeControl: els.timeControl.value, startFen: state.chess.fen(),
    clocks: { w: timeControl.base * 1000, b: timeControl.base * 1000 },
    moves: [], result: 'In progress', favorite: false,
  };
  state.matches.unshift(state.currentMatch);
  startClockTurn();
  saveApp();
  draw();
  setPanel('play');
  if (state.userColor === 'b') requestBotMove();
}

function openHome() {
  cancelSearch();
  if (state.gameActive) { pauseClock(); state.gameActive = false; saveApp(); }
  $('#game-screen').hidden = true;
  $('#home-screen').hidden = false;
}

function showGame() {
  $('#home-screen').hidden = true;
  $('#game-screen').hidden = false;
}

function resumeSavedGame() {
  if (!state.currentMatch) return;
  showGame();
  state.gameActive = state.currentMatch.result === 'In progress';
  draw();
  if (state.gameActive) {
    startClockTurn();
    if (els.model.value === 'stockfish' && !state.engineReady) { state.pendingResume = true; loadEngine(); }
    else if (state.chess.turn() !== state.userColor) requestBotMove();
  }
}

function restartMatch() {
  if (!state.currentMatch) return;
  const fen = state.currentMatch.startFen || new Chess().fen();
  state.currentMatch.result = 'Restarted';
  state.gameActive = false;
  pauseClock();
  saveApp();
  newMatch(fen);
}

function currentHistory() {
  return state.chess.history({ verbose: true });
}

function parseTimeControl(value) {
  const [base = '0', increment = '0'] = String(value || '0+0').split('+');
  return { base: Number(base) || 0, increment: Number(increment) || 0 };
}

function formatClock(ms) {
  const safe = Math.max(0, ms);
  if (safe < 10000) return `${Math.floor(safe / 1000)}.${Math.floor((safe % 1000) / 100)}`;
  const seconds = Math.ceil(safe / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function drawClocks() {
  const match = state.currentMatch;
  const control = parseTimeControl(match?.timeControl || state.timeControl);
  const clocks = match?.clocks || { w: control.base * 1000, b: control.base * 1000 };
  const engineColor = state.userColor === 'w' ? 'b' : 'w';
  els.clockBot.textContent = control.base ? formatClock(clocks[engineColor] ?? control.base * 1000) : '∞';
  els.clockYou.textContent = control.base ? formatClock(clocks[state.userColor] ?? control.base * 1000) : '∞';
  els.clockBot.classList.toggle('clock-low', control.base > 0 && clocks[engineColor] < 10000);
  els.clockYou.classList.toggle('clock-low', control.base > 0 && clocks[state.userColor] < 10000);
}

function startClockTurn(color = state.chess.turn()) {
  if (!state.currentMatch || !parseTimeControl(state.currentMatch.timeControl).base) { drawClocks(); return; }
  state.clockColor = color;
  state.clockPaused = false;
  state.clockLastTick = Date.now();
  if (!state.clockTimer) state.clockTimer = setInterval(updateClocks, 100);
  drawClocks();
}

function pauseClock() {
  updateClocks();
  state.clockPaused = true;
  state.clockLastTick = null;
}

function resumeClock() {
  if (!state.gameActive) return;
  startClockTurn(state.chess.turn());
}

function updateClocks() {
  if (state.clockPaused || !state.gameActive || !state.currentMatch || !state.clockLastTick) return;
  const control = parseTimeControl(state.currentMatch.timeControl);
  if (!control.base) return;
  const now = Date.now();
  const color = state.clockColor || state.chess.turn();
  const elapsed = now - state.clockLastTick;
  state.clockLastTick = now;
  state.currentMatch.clocks[color] = Math.max(0, (state.currentMatch.clocks[color] ?? control.base * 1000) - elapsed);
  if (state.currentMatch.clocks[color] <= 0) {
    state.clockPaused = true;
    state.gameActive = false;
    state.currentMatch.result = `${color === 'w' ? 'Black' : 'White'} wins on time`;
    saveApp();
    draw();
    showToast(state.currentMatch.result);
    return;
  }
  drawClocks();
  if (now - state.clockSaveAt > 1000) { state.clockSaveAt = now; saveApp(); }
}

function settleClockForMove(color) {
  updateClocks();
  if (!state.gameActive) return false;
  const control = parseTimeControl(state.currentMatch?.timeControl);
  if (control.base && state.currentMatch?.clocks) {
    state.currentMatch.clocks[color] += control.increment * 1000;
  }
  return true;
}

function positionFromMatch(match, ply = match.moves.length) {
  const chess = new Chess(match.startFen || new Chess().fen());
  for (const savedMove of match.moves.slice(0, ply)) {
    const uci = savedMove.uci || '';
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
  }
  return chess;
}

function showReplayPosition(ply) {
  if (!state.currentMatch) return;
  if (state.replayPly === null) { state.resumeAfterReplay = state.gameActive; pauseClock(); }
  state.replayPly = Math.max(0, Math.min(ply, state.currentMatch.moves.length));
  state.chess = positionFromMatch(state.currentMatch, state.replayPly);
  state.gameActive = false;
  state.selected = null;
  state.replacingBotMove = false;
  draw();
}

function returnToLivePosition() {
  if (!state.currentMatch || state.replayPly === null) return;
  state.replayPly = null;
  state.chess = positionFromMatch(state.currentMatch);
  state.gameActive = state.currentMatch.result === 'In progress';
  state.selected = null;
  draw();
  if (state.gameActive) {
    resumeClock();
    if (state.chess.turn() !== state.userColor) {
      if (state.engineReady || els.model.value === 'maia3') requestBotMove();
      else { state.pendingResume = true; loadEngine(); }
    }
  }
}

function syncCurrentMoves() {
  if (!state.currentMatch) return;
  const history = currentHistory();
  const oldReview = state.currentMatch.moves.map((move) => move.reviewLabel || '');
  state.currentMatch.review = null;
  state.manualPlyIndexes = new Set([...state.manualPlyIndexes].filter((ply) => ply < history.length));
  state.currentMatch.moves = history.map((move, index) => {
    const uci = `${move.from}${move.to}${move.promotion || ''}`;
    return { san: move.san, uci, color: move.color, label: state.manualPlyIndexes.has(index) ? 'Manual replacement' : '', reviewLabel: oldReview[index] || '' };
  });
  if (state.chess.isGameOver()) {
    state.currentMatch.result = state.chess.isCheckmate() ? `${state.chess.turn() === 'w' ? 'Black' : 'White'} wins by checkmate` : 'Draw';
    state.gameActive = false;
    state.clockPaused = true;
    state.clockLastTick = null;
  }
  saveApp();
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
  drawMoveArrows();
}

function drawMoves() {
  const history = state.currentMatch?.moves || currentHistory();
  els.moveCount.textContent = String(history.length);
  if (els.matchSummary && state.currentMatch) {
    const opponent = state.currentMatch.model === 'maia3' ? `Maia · ${state.currentMatch.strength}` : 'Stockfish';
    const side = state.currentMatch.userColor === 'w' ? 'White' : 'Black';
    els.matchSummary.textContent = `${opponent} · You play ${side}`;
  }
  els.replayReturn.hidden = state.replayPly === null;
  if (!history.length) {
    els.moveList.innerHTML = '<div class="empty-moves"><span>♘</span><p>Your moves will appear here.</p></div>';
    return;
  }
  const movesByPly = [];
  for (let i = 0; i < history.length; i += 2) movesByPly.push([history[i], history[i + 1]]);
  els.moveList.innerHTML = movesByPly.map(([white, black], i) => {
    const render = (move, ply) => move ? `<button class="move-san${state.replayPly === ply + 1 || (state.replayPly === null && ply === history.length - 1) ? ' current-san' : ''}" data-ply="${ply + 1}" title="Show position after ${escapeHtml(move.san)}">${escapeHtml(move.san)}${state.manualPlyIndexes.has(ply) ? '<small class="move-label">Manual replacement</small>' : ''}</button>` : '<span class="move-placeholder">—</span>';
    return `<div class="move-row"><span class="move-number">${i + 1}.</span>${render(white, i * 2)}${render(black, i * 2 + 1)}</div>`;
  }).join('');
  els.moveList.querySelectorAll('[data-ply]').forEach((button) => button.addEventListener('click', () => showReplayPosition(Number(button.dataset.ply))));
  els.moveList.scrollTop = els.moveList.scrollHeight;
}

function drawHistory() {
  els.historyCount.textContent = String(state.matches.length);
  const query = els.historySearch.value.trim().toLowerCase();
  const filtered = state.matches.filter((match) => {
    const date = new Date(match.startedAt).toLocaleString();
    return `${date} ${match.userColor} ${match.result} ${match.moves.length}`.toLowerCase().includes(query);
  });
  if (!filtered.length) {
    els.historyList.innerHTML = state.matches.length ? '<p class="history-empty">No matches found.</p>' : '<p class="history-empty">Completed and saved matches show up here.</p>';
    return;
  }
  if (!state.matches.length) {
    els.historyList.innerHTML = '<p class="history-empty">Completed and saved matches show up here.</p>';
    return;
  }
  els.historyList.innerHTML = filtered.map((match) => `<div class="history-item${match.id === state.currentMatch?.id ? ' active-match' : ''}"><button class="history-load" data-match="${match.id}"><span class="history-icon">♞</span><span class="history-info"><strong>${new Date(match.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${match.userColor === 'w' ? 'White' : 'Black'}</strong><small>${match.moves.length} plies · ${escapeHtml(match.result || 'Saved match')}</small></span></button><button class="favorite-match${match.favorite ? ' is-favorite' : ''}" data-favorite="${match.id}" title="${match.favorite ? 'Remove favorite' : 'Favorite match'}">${match.favorite ? '★' : '☆'}</button></div>`).join('');
  els.historyList.querySelectorAll('[data-match]').forEach((button) => button.addEventListener('click', () => loadMatch(button.dataset.match)));
  els.historyList.querySelectorAll('[data-favorite]').forEach((button) => button.addEventListener('click', () => {
    const match = state.matches.find((item) => item.id === button.dataset.favorite);
    if (match) { match.favorite = !match.favorite; saveApp(); drawHistory(); }
  }));
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
  const isMaia = els.model.value === 'maia3';
  const ready = state.engineReady;
  els.engineState.textContent = state.thinking ? 'THINKING' : isMaia ? 'SETUP' : ready ? 'READY' : 'OFF';
  els.engineState.className = `engine-state${ready && !isMaia ? ' engine-on' : ''}${state.thinking ? ' engine-thinking' : ''}`;
  els.engineCaption.textContent = isMaia ? `Maia · ${state.thinking ? 'choosing a move' : 'human-like opponent'}` : state.engineReady ? `Stockfish · ${state.thinking ? 'thinking' : 'ready'}` : 'Stockfish · loading locally';
  els.undoYou.disabled = !state.gameActive || !historyHasUserMove();
  els.undoBot.disabled = !state.gameActive || !historyHasBotMove();
  $('#stop-button').disabled = !state.thinking;
  els.undoBot.classList.toggle('undo-highlight', state.replacingBotMove);
  drawClocks();
}

function draw() {
  drawBoard(); drawMoves(); drawStatus(); drawHistory();
}

function setPanel(name) {
  document.querySelectorAll('.panel-tab').forEach((tab) => {
    const active = tab.dataset.panel === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('.panel-view').forEach((view) => {
    const active = view.dataset.view === name;
    view.hidden = !active;
    view.classList.toggle('active', active);
  });
  $('#panel-title').textContent = ({ play: 'Moves', analysis: 'Analyze', games: 'Saved games' })[name] || 'Moves';
}

function parseEngineInfo(line) {
  if (!state.engineTask || !['analysis', 'hint', 'review'].includes(state.engineTask.type)) return;
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1] || 0);
  const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
  const pv = line.match(/\bpv (.+)$/)?.[1];
  if (!scoreMatch || !pv) return;
  const root = new Chess(state.engineTask.fen);
  const uciMoves = pv.trim().split(/\s+/);
  const sans = [];
  for (const uci of uciMoves) {
    try { sans.push(root.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) }).san); } catch { break; }
  }
  const raw = Number(scoreMatch[2]);
  const cp = scoreMatch[1] === 'mate' ? (raw > 0 ? 10000 - raw : -10000 - raw) : raw;
  const whiteCp = state.engineTask.rootTurn === 'w' ? cp : -cp;
  if (state.engineTask.type === 'review') { state.analysisScore = whiteCp; return; }
  state.analysisLines[multipv - 1] = { san: sans.join(' '), uci: uciMoves[0], score: whiteCp, depth };
  if (multipv === 1) state.analysisScore = whiteCp;
  renderAnalysis();
}

function renderAnalysis() {
  const score = state.analysisScore;
  els.analysisScore.textContent = score == null ? '—' : `${score > 0 ? '+' : ''}${(score / 100).toFixed(1)}`;
  const whitePercent = score == null ? 50 : 100 / (1 + Math.exp(-score / 250));
  els.evaluationFill.style.width = `${whitePercent}%`;
  els.candidates.innerHTML = state.analysisLines.filter(Boolean).slice(0, 3).map((line, i) => `<div class="candidate-line"><b>${i + 1}</b><span>${escapeHtml(line.san || '…')}</span><small>${line.score > 0 ? '+' : ''}${(line.score / 100).toFixed(1)}</small></div>`).join('') || '<p class="analysis-empty">Analyze a position to see candidate moves.</p>';
}

function analyzePosition(type = 'analysis') {
  if (!state.engineReady) { if (type === 'hint') state.pendingHint = true; else state.pendingAnalysis = true; loadEngine(); showToast('Loading Stockfish locally…'); return; }
  if (state.thinking) { showToast('Wait for the engine to be ready.'); return; }
  const resumeClock = state.gameActive && state.replayPly === null;
  if (resumeClock) pauseClock();
  state.analysisLines = []; state.analysisScore = null;
  state.hintActive = false;
  state.engineTask = { type, fen: state.chess.fen(), rootTurn: state.chess.turn(), resumeClock };
  state.thinking = true; renderAnalysis();
  state.worker.postMessage('setoption name MultiPV value 3');
  state.worker.postMessage(`position fen ${state.chess.fen()}`);
  state.worker.postMessage(`go depth ${state.searchDepth}`); drawStatus();
}

function requestHint() {
  if (!state.gameActive) { showToast('Start a game before asking for a hint.'); return; }
  if (state.thinking) { showToast('Wait for the current move or analysis to finish.'); return; }
  state.hintActive = false;
  drawMoveArrows();
  analyzePosition('hint');
}

function drawMoveArrows() {
  if (!els.arrows) return;
  els.arrows.replaceChildren();
  if (!state.hintActive || state.analysisFen !== state.chess.fen()) return;
  const svg = $('#move-arrows');
  const rect = svg.getBoundingClientRect();
  const unique = [];
  for (const line of state.analysisLines.filter(Boolean)) {
    if (!line.uci || unique.some((item) => item.uci === line.uci)) continue;
    unique.push(line);
    if (unique.length === 2) break;
  }
  unique.forEach((line, index) => {
    const from = els.board.querySelector(`[data-square="${line.uci.slice(0, 2)}"]`)?.getBoundingClientRect();
    const to = els.board.querySelector(`[data-square="${line.uci.slice(2, 4)}"]`)?.getBoundingClientRect();
    if (!from || !to || !rect.width || !rect.height) return;
    const center = (r) => ({ x: ((r.left + r.width / 2 - rect.left) / rect.width) * 1000, y: ((r.top + r.height / 2 - rect.top) / rect.height) * 1000 });
    const start = center(from), end = center(to);
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    arrow.setAttribute('x1', String(start.x)); arrow.setAttribute('y1', String(start.y));
    arrow.setAttribute('x2', String(end.x)); arrow.setAttribute('y2', String(end.y));
    arrow.setAttribute('class', `hint-arrow hint-arrow-${index + 1}`);
    arrow.setAttribute('marker-end', `url(#arrow-${index === 0 ? 'one' : 'two'})`);
    els.arrows.append(arrow);
  });
}

function buildReviewPositions() {
  const match = state.currentMatch;
  const positions = [match.startFen || new Chess().fen()];
  const chess = new Chess(positions[0]);
  for (const move of match.moves) { chess.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), ...(move.uci[4] ? { promotion: move.uci[4] } : {}) }); positions.push(chess.fen()); }
  return positions;
}
function reviewGame() {
  if (!state.currentMatch || !state.currentMatch.moves.length) { showToast('Start or load a game before reviewing it.'); return; }
  if (!state.engineReady) { state.pendingReview = true; loadEngine(); showToast('Loading Stockfish for game review…'); return; }
  if (state.thinking) { showToast('Wait for the engine to be ready.'); return; }
  if (state.gameActive) pauseClock();
  state.reviewPositions = buildReviewPositions(); state.reviewScores = []; state.reviewIndex = 0;
  $('#review-game').textContent = 'Stop review'; $('#review-game').dataset.stop = 'true';
  runReviewPosition();
}
function runReviewPosition() {
  if (state.reviewIndex >= state.reviewPositions.length) { finishReview(); return; }
  state.analysisScore = null;
  state.engineTask = { type: 'review', fen: state.reviewPositions[state.reviewIndex], rootTurn: new Chess(state.reviewPositions[state.reviewIndex]).turn() };
  state.thinking = true;
  els.reviewStatus.textContent = `Reviewing position ${state.reviewIndex + 1} of ${state.reviewPositions.length}`;
  state.worker.postMessage('setoption name MultiPV value 1');
  state.worker.postMessage(`position fen ${state.engineTask.fen}`);
  state.worker.postMessage(`go depth ${state.searchDepth}`); drawStatus();
}
function finishReview() {
  state.thinking = false; state.engineTask = null;
  if (state.reviewScores.length > 1 && state.currentMatch) {
    state.currentMatch.moves.forEach((move, i) => {
      const before = state.reviewScores[i], after = state.reviewScores[i + 1];
      if (before == null || after == null) return;
      const loss = move.color === 'w' ? before - after : after - before;
      move.reviewLabel = loss > 250 ? 'Blunder' : loss > 100 ? 'Mistake' : loss > 50 ? 'Inaccuracy' : 'Best';
    });
    state.currentMatch.review = { depth: state.searchDepth, completedAt: new Date().toISOString() }; saveApp();
    els.reviewStatus.textContent = `Review complete · ${state.currentMatch.moves.length} moves classified`;
  } else els.reviewStatus.textContent = 'Review stopped.';
  $('#review-game').textContent = 'Review game'; $('#review-game').dataset.stop = '';
  if (state.gameActive) resumeClock(); draw();
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
    state.hintActive = false;
    const mover = state.chess.turn();
    if (!settleClockForMove(mover)) return false;
    state.chess.move(options);
    if (state.replacingBotMove) state.manualPlyIndexes.add(currentHistory().length - 1);
    state.replacingBotMove = false;
    state.selected = null;
    syncCurrentMoves();
    startClockTurn(state.chess.turn());
    draw();
    if (!state.chess.isGameOver() && state.chess.turn() !== state.userColor && (state.engineReady || els.model.value === 'maia3')) requestBotMove();
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
      worker.postMessage('setoption name Skill Level value ' + Number(els.model.value === 'maia3' ? 20 : els.strength.value));
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
      if (state.pendingHint) { state.pendingHint = false; analyzePosition('hint'); }
      else if (state.pendingAnalysis) { state.pendingAnalysis = false; analyzePosition(); }
      else if (state.pendingReview) { state.pendingReview = false; reviewGame(); }
    } else if (line.startsWith('bestmove')) {
      if (state.ignoreBestMove) {
        state.ignoreBestMove = false;
        state.thinking = false;
        drawStatus();
        return;
      }
      const uci = line.split(/\s+/)[1];
      const task = state.engineTask; state.engineTask = null;
      if (task?.type === 'analysis' || task?.type === 'hint') {
        state.thinking = false;
        state.analysisFen = task.fen;
        state.hintActive = task.type === 'hint';
        renderAnalysis();
        drawMoveArrows();
        if (task.resumeClock && state.gameActive) resumeClock();
        drawStatus();
      } else if (task?.type === 'review') {
        state.thinking = false;
        if (task.cancelled) { finishReview(); return; }
        state.reviewScores.push(state.analysisScore);
        state.reviewIndex += 1;
        runReviewPosition();
      } else {
       state.thinking = false;
       if (task?.type === 'move' && state.gameActive && uci && uci !== '(none)') {
        if (!settleClockForMove(task.rootTurn)) return;
        const from = uci.slice(0, 2); const to = uci.slice(2, 4); const promotion = uci[4];
        try {
          state.chess.move({ from, to, ...(promotion ? { promotion } : {}) });
          syncCurrentMoves();
          startClockTurn(state.chess.turn());
        } catch { showToast('The engine returned an invalid move.'); }
       }
       draw();
      }
    } else if (line.startsWith('info depth')) {
      const depth = line.match(/\bdepth (\d+)/)?.[1];
      if (depth) els.engineCaption.textContent = `Stockfish · depth ${depth}`;
      parseEngineInfo(line);
    }
  });
  worker.addEventListener('error', () => {
    state.engineReady = false; state.thinking = false;
    els.engineNote.textContent = 'Could not start the bundled Stockfish engine. Reinstall the app files and try again.';
    drawStatus();
  });
  worker.postMessage('uci');
}

function requestBotMove() {
  if (state.thinking || state.chess.isGameOver()) return;
  if (els.model.value === 'maia3') {
    const matchId = state.currentMatch?.id;
    const rootTurn = state.chess.turn();
    state.thinking = true;
    state.replacingBotMove = false;
    state.maiaAbort = new AbortController();
    drawStatus();
    fetch('/api/maia/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: state.maiaAbort.signal,
      body: JSON.stringify({ fen: state.chess.fen(), startFen: state.currentMatch.startFen, moves: state.currentMatch.moves.map((item) => item.uci), elo: Number(els.strength.value) }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not start Maia.');
      if (!state.gameActive || state.currentMatch?.id !== matchId || !state.thinking) return;
      if (!data.move || data.move === '(none)') throw new Error('Maia did not return a move.');
      if (!settleClockForMove(rootTurn)) return;
      const move = data.move;
      state.chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
      syncCurrentMoves();
      startClockTurn(state.chess.turn());
    }).catch((error) => {
      if (error.name !== 'AbortError') showToast(error.message || 'Maia could not start. See Settings → Engine.');
    }).finally(() => {
      if (state.currentMatch?.id === matchId) { state.thinking = false; state.maiaAbort = null; draw(); }
    });
    return;
  }
  if (!state.worker || !state.engineReady) return;
  state.thinking = true;
  state.engineTask = { type: 'move', fen: state.chess.fen(), rootTurn: state.chess.turn() };
  state.replacingBotMove = false;
  state.worker.postMessage(`setoption name Skill Level value ${Number(els.strength.value)}`);
  state.worker.postMessage(`position fen ${state.chess.fen()}`);
  state.worker.postMessage(`go depth ${state.searchDepth}`);
  drawStatus();
}

function cancelSearch() {
  state.maiaAbort?.abort();
  state.maiaAbort = null;
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
  const chess = new Chess(match.startFen || new Chess().fen());
  for (const savedMove of match.moves) {
    const uci = savedMove.uci || '';
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
    if (move && savedMove.label) move.manual = true;
  }
  state.chess = chess;
  state.userColor = match.userColor;
  state.orientation = match.userColor;
  state.currentMatch = match;
  showGame();
  state.manualPlyIndexes = new Set(match.moves.map((item, index) => item.label ? index : -1).filter((index) => index >= 0));
  state.gameActive = match.result === 'In progress';
  state.replacingBotMove = false;
  state.replayPly = null;
  state.timeControl = match.timeControl || '0+0'; els.timeControl.value = state.timeControl;
  els.side.value = match.userColor;
  els.model.value = match.model || 'stockfish';
  els.model.dispatchEvent(new Event('change'));
  els.strength.value = String(match.strength || (els.model.value === 'maia3' ? 1600 : 12));
  state.pendingResume = !state.engineReady && els.model.value === 'stockfish';
  setPanel('play');
  draw();
  if (state.gameActive) startClockTurn();
  if (els.model.value === 'stockfish' && !state.engineReady) loadEngine();
  else if (state.gameActive && state.chess.turn() !== state.userColor) requestBotMove();
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
  if (tab === 'engine') content.innerHTML = `<div class="setting-block"><span class="setting-icon">♟</span><div class="setting-copy"><strong>Stockfish 19 · Lite</strong><p>Bundled with the project and runs locally in your browser.</p><label class="setting-select-label">Search depth<select id="depth-select"><option value="8">8 · faster replies</option><option value="12">12 · balanced</option><option value="16">16 · deeper search</option><option value="20">20 · longest search</option></select></label></div><span class="coming-soon">LOCAL</span></div><div class="setting-block"><span class="setting-icon">♞</span><div class="setting-copy"><strong>Maia-3 · human-like</strong><p>The checkpoint and Maia engine source are included. The Windows desktop release bundles its Python runtime and libraries, so the installed app runs Maia without a separate Python setup or model download.</p></div><span class="coming-soon">LOCAL</span></div><div class="setting-block"><span class="setting-icon">◉</span><div class="setting-copy"><strong>Noctie</strong><p>No local downloadable model or public engine interface is available in its official offering, so it cannot be added as an offline engine.</p></div><span class="coming-soon">UNAVAILABLE</span></div><div class="privacy-note"><span>●</span><p>Games, engine files, and model inference stay on this device. No paid service or API key is used.</p></div>`;
  if (tab === 'position') content.innerHTML = `<div class="setting-block"><span class="setting-icon">⌗</span><div class="setting-copy"><strong>Custom position</strong><p>Paste a FEN position to start a new match, or copy the current board.</p><textarea id="fen-input" class="fen-input" rows="4" spellcheck="false" placeholder="Paste FEN here"></textarea><div class="fen-actions"><button id="load-fen" class="primary-button small-button">Start from FEN</button><button id="copy-fen" class="subtle-button">Copy current FEN</button></div></div></div>`;
  if (tab === 'game') content.innerHTML = `<div class="setting-row"><div><strong>Board theme</strong><p>Green board · Neo pieces, loaded from your local assets folder.</p></div><span class="setting-check">✓</span></div><div class="setting-row"><div><strong>Board orientation</strong><p>Flip the board without changing your side in the game.</p></div><button id="settings-flip" class="subtle-button">⇅ Flip</button></div><div class="setting-row"><div><strong>Move replacement</strong><p>Undo a bot move to choose a different legal move for its side. The previous continuation is discarded.</p></div><span class="setting-check">✓</span></div><div class="setting-row"><div><strong>Match history</strong><p>Saved locally in this browser.</p></div><span class="setting-check">✓</span></div>`;
  if (tab === 'about') content.innerHTML = `<div class="about-card"><span class="about-knight">♞</span><h3>Chess on your terms.</h3><p>A local chess game with configurable engines, flexible sides, and editable continuations.</p><span class="version-label">VERSION · 1.0.0</span></div><div class="license-note"><strong>Engine licenses</strong><p>Stockfish is GPL-3.0 and Maia-3 is AGPL-3.0. Their license files and Maia's bundled model are included with the project.</p></div>`;
  const depthSelect = $('#depth-select');
  if (depthSelect) {
    depthSelect.value = String(state.searchDepth);
    depthSelect.addEventListener('change', () => { state.searchDepth = Number(depthSelect.value); saveApp(); });
  }
  $('#load-fen')?.addEventListener('click', () => { if (!state.engineReady) { showToast('Load Stockfish first from the Engine tab.'); return; } newMatch($('#fen-input').value.trim()); $('#settings-overlay').hidden = true; });
  $('#copy-fen')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.chess.fen()); showToast('FEN copied.'); } catch { showToast(state.chess.fen()); } });
  $('#settings-flip')?.addEventListener('click', () => { state.orientation = state.orientation === 'w' ? 'b' : 'w'; drawBoard(); });
}

function bindEvents() {
  $('#start-button').addEventListener('click', () => {
    if (els.model.value === 'maia3') { newMatch(); return; }
    if (!state.engineReady) {
      state.pendingStart = true;
      loadEngine();
      showToast('Loading the local engine…');
      return;
    }
    newMatch();
  });
  $('#new-game').addEventListener('click', openHome);
  $('#resume-game').addEventListener('click', resumeSavedGame);
  $('#restart-button').addEventListener('click', restartMatch);
  $('#hint-button').addEventListener('click', requestHint);
  $('#stop-button').addEventListener('click', () => { cancelSearch(); drawStatus(); });
  els.model.addEventListener('change', () => {
    const maia = els.model.value === 'maia3';
    $('#engine-name').textContent = maia ? 'Maia-3' : 'Stockfish';
    $('#engine-subtitle').textContent = maia ? 'A human-like opponent, matched to your rating' : 'Strong local chess engine';
    els.engineNote.textContent = maia ? 'Maia plays human-like moves at the selected rating. Its offline engine is included in the desktop build.' : 'Stockfish is ready to play at adjustable strength.';
    els.strength.innerHTML = maia
      ? '<option value="400">Beginner · ~400</option><option value="800">Casual · ~800</option><option value="1200">Club · ~1200</option><option value="1600" selected>Advanced · ~1600</option><option value="2000">Expert · ~2000</option><option value="2400">Master · ~2400</option><option value="2800">Grandmaster · ~2800</option>'
      : '<option value="4">Beginner</option><option value="8">Casual</option><option value="12" selected>Club</option><option value="16">Strong</option><option value="20">Maximum</option>';
    if (state.currentMatch && state.gameActive) {
      state.currentMatch.model = els.model.value;
      state.currentMatch.engine = maia ? 'Maia' : 'Stockfish';
      state.currentMatch.strength = Number(els.strength.value);
    }
    saveApp(); drawStatus();
  });
  document.querySelectorAll('.panel-tab').forEach((tab) => tab.addEventListener('click', () => setPanel(tab.dataset.panel)));
  $('#analyze-position').addEventListener('click', analyzePosition);
  $('#review-game').addEventListener('click', () => {
    if ($('#review-game').dataset.stop) { if (state.engineTask) state.engineTask.cancelled = true; state.worker?.postMessage('stop'); return; }
    reviewGame();
  });
  els.replayReturn.addEventListener('click', returnToLivePosition);
  els.historySearch.addEventListener('input', drawHistory);
  $('#export-pgn').addEventListener('click', exportPgn);
  $('#import-pgn-button').addEventListener('click', () => $('#import-pgn').click());
  $('#import-pgn').addEventListener('change', importPgn);
  $('#flip-button').addEventListener('click', () => { state.orientation = state.orientation === 'w' ? 'b' : 'w'; drawBoard(); });
  els.undoYou.addEventListener('click', undoMyMove);
  els.undoBot.addEventListener('click', undoBotMove);
  const openSettings = () => { renderSettings(); $('#settings-overlay').hidden = false; };
  $('#settings-open').addEventListener('click', openSettings);
  $('#home-settings-open').addEventListener('click', openSettings);
  $('#settings-close').addEventListener('click', () => { $('#settings-overlay').hidden = true; });
  $('#settings-overlay').addEventListener('click', (event) => { if (event.target === $('#settings-overlay')) $('#settings-overlay').hidden = true; });
  document.querySelectorAll('.settings-tab').forEach((button) => button.addEventListener('click', () => renderSettings(button.dataset.tab)));
  els.side.addEventListener('change', () => { if (!state.gameActive) { state.userColor = els.side.value; state.orientation = state.orientationPref === 'auto' ? state.userColor : state.orientationPref; saveApp(); draw(); } });
  els.strength.addEventListener('change', () => { if (state.currentMatch && state.gameActive) state.currentMatch.strength = Number(els.strength.value); saveApp(); });
  els.timeControl.addEventListener('change', () => { state.timeControl = els.timeControl.value; saveApp(); });
  $('#resize-handle').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startX = event.clientX; const startWidth = els.board.getBoundingClientRect().width;
    const move = (pointerEvent) => {
      const width = Math.min(Math.max(startWidth + pointerEvent.clientX - startX, 280), Math.min(window.innerWidth - 24, window.innerHeight - 170));
      document.documentElement.style.setProperty('--board-size', `${width}px`); localStorage.setItem('stockfish-helper-board-size', String(width));
    };
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
  });
}

function exportPgn() {
  if (!state.currentMatch) { showToast('There is no game to export.'); return; }
  const chess = positionFromMatch(state.currentMatch);
  chess.header('Event', 'Local Chess Match', 'Date', new Date(state.currentMatch.startedAt).toISOString().slice(0, 10).replaceAll('-', '.'), 'Result', chess.isCheckmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') : '*');
  const blob = new Blob([chess.pgn({ maxWidth: 80 })], { type: 'application/x-chess-pgn' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `chess-match-${new Date().toISOString().slice(0, 10)}.pgn`; link.click(); URL.revokeObjectURL(link.href);
}
async function importPgn(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const text = await file.text();
    const fenTag = text.match(/^\s*\[FEN\s+"([^"]+)"\]/mi)?.[1];
    const chess = new Chess(fenTag || undefined); chess.loadPgn(text);
    const startFen = fenTag || new Chess().fen();
    const replay = new Chess(startFen);
    const moves = chess.history({ verbose: true });
    const savedMoves = moves.map((move) => ({ san: move.san, uci: `${move.from}${move.to}${move.promotion || ''}`, color: move.color, label: '' }));
    const match = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), userColor: els.side.value, engine: 'Stockfish', strength: Number(els.strength.value), searchDepth: state.searchDepth, timeControl: '0+0', clocks: { w: 0, b: 0 }, startFen, moves: savedMoves, result: 'Imported game', favorite: false };
    for (const move of savedMoves) replay.move({ from: move.uci.slice(0,2), to: move.uci.slice(2,4), ...(move.uci[4] ? { promotion: move.uci[4] } : {}) });
    state.matches.unshift(match); state.currentMatch = match; state.chess = replay; state.userColor = match.userColor; state.gameActive = false; state.replayPly = null; state.manualPlyIndexes = new Set(); saveApp(); draw(); showToast('PGN imported.');
  } catch (error) { showToast(`Could not import PGN: ${error.message}`); }
  event.target.value = '';
}

bindEvents();
if (savedSettings.model) { els.model.value = savedSettings.model; els.model.dispatchEvent(new Event('change')); }
if (savedSettings.side) els.side.value = savedSettings.side;
if (savedSettings.strength) els.strength.value = String(savedSettings.strength);
if (savedSettings.timeControl) els.timeControl.value = savedSettings.timeControl;
state.userColor = els.side.value; state.timeControl = els.timeControl.value;
const savedBoardSize = Number(localStorage.getItem('stockfish-helper-board-size'));
if (savedBoardSize > 0) document.documentElement.style.setProperty('--board-size', `${savedBoardSize}px`);
const activeMatch = state.matches.find((match) => match.id === stored.activeMatchId && match.result === 'In progress');
if (activeMatch) {
  state.currentMatch = activeMatch; state.chess = positionFromMatch(activeMatch); state.userColor = activeMatch.userColor;
  state.orientation = activeMatch.userColor; state.gameActive = false; state.manualPlyIndexes = new Set(activeMatch.moves.map((move, i) => move.label ? i : -1).filter((i) => i >= 0));
  state.timeControl = activeMatch.timeControl || '0+0'; els.timeControl.value = state.timeControl;
  els.model.value = activeMatch.model || savedSettings.model || 'stockfish';
  els.model.dispatchEvent(new Event('change'));
  els.strength.value = String(activeMatch.strength || (els.model.value === 'maia3' ? 1600 : 12));
  activeMatch.strength = Number(els.strength.value);
  state.pendingResume = false;
  $('#resume-game').hidden = false;
  $('#resume-game').textContent = `Resume unfinished game · ${activeMatch.moves.length} moves`;
}
els.boardHint.textContent = 'Drag a piece, or click a piece and target square';
const boardImage = new Image();
boardImage.onload = () => { state.boardThemeAvailable = true; els.board.style.backgroundImage = 'url("/assets/9rdwe.png")'; drawBoard(); };
boardImage.onerror = () => { state.boardThemeAvailable = false; els.board.style.backgroundImage = ''; drawBoard(); };
boardImage.src = '/assets/9rdwe.png';
draw();
if (activeMatch) $('#resume-game').hidden = false;

