import { Chess } from 'chess.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const THEME_NAMES = ['Hanging pieces', 'Forks', 'Back-rank threats', 'Pins', 'Discovered attacks', 'Overloaded pieces', 'King safety', 'Endgame technique', 'Opening principles'];
const opposite = (color) => color === 'w' ? 'b' : 'w';

export function detectThemes(fen) {
  let chess;
  try { chess = new Chess(fen); } catch { return []; }
  const board = chess.board();
  const pieces = board.flat().filter(Boolean);
  const fullmove = Number(String(fen).split(/\s+/)[5]) || 1;
  const pieceSquares = [];
  board.forEach((row, ri) => row.forEach((piece, fi) => { if (piece) pieceSquares.push({ piece, square: `${'abcdefgh'[fi]}${8 - ri}` }); }));
  const themes = new Set();
  if (pieces.length <= 12) themes.add('Endgame technique');
  if (fullmove <= 8) themes.add('Opening principles');
  for (const color of ['w', 'b']) {
    const king = pieces.find((piece) => piece.color === color && piece.type === 'k');
    const kingSquare = pieceSquares.find((entry) => entry.piece === king)?.square;
    if (king && kingSquare && chess.isAttacked(kingSquare, opposite(color))) themes.add('King safety');
  }
  for (const piece of pieces) {
    const square = pieceSquares.find((entry) => entry.piece === piece)?.square;
    if (!square) continue;
    const attackers = chess.attackers(square, opposite(piece.color));
    const defenders = chess.attackers(square, piece.color);
    if (attackers.length && attackers.length > defenders.length && VALUE[piece.type] >= 3) themes.add('Hanging pieces');
    if (piece.type === 'n' || piece.type === 'q') {
      const targets = pieceSquares.filter((entry) => entry.piece.color !== piece.color && VALUE[entry.piece.type] >= 3 && chess.attackers(entry.square, piece.color).includes(square));
      if (targets.length >= 2) themes.add('Forks');
    }
  }
  const dirs = { r: [[1,0],[-1,0],[0,1],[0,-1]], b: [[1,1],[1,-1],[-1,1],[-1,-1]], q: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] };
  for (const { piece: slider, square } of pieceSquares) {
    if (!dirs[slider.type]) continue;
    const x0 = square.charCodeAt(0) - 97, y0 = Number(square[1]) - 1;
    for (const [dx, dy] of dirs[slider.type]) {
      let x = x0 + dx, y = y0 + dy; let blocker = null;
      while (x >= 0 && x < 8 && y >= 0 && y < 8) {
        const targetSquare = `${'abcdefgh'[x]}${y + 1}`;
        const target = chess.get(targetSquare);
        if (target) {
          if (!blocker) blocker = { piece: target, square: targetSquare };
          else {
            if (blocker.piece.color === slider.color && target.color !== slider.color) {
              if (['k', 'q', 'r'].includes(target.type)) themes.add('Pins');
              if (['k', 'q'].includes(target.type)) themes.add('Discovered attacks');
            }
            break;
          }
        }
        x += dx; y += dy;
      }
    }
  }
  for (const color of ['w', 'b']) {
    const kingSq = pieceSquares.find((entry) => entry.piece.color === color && entry.piece.type === 'k')?.square;
    if (!kingSq || !((color === 'w' && kingSq[1] === '1') || (color === 'b' && kingSq[1] === '8'))) continue;
    const trapped = chess.moves({ square: kingSq, verbose: true }).length <= 1;
    const enemySliderOnRank = pieceSquares.some(({ piece, square }) => piece.color !== color && ['q', 'r'].includes(piece.type) && square[1] === kingSq[1] && chess.isAttacked(kingSq, piece.color));
    if (trapped && enemySliderOnRank) themes.add('Back-rank threats');
  }
  for (const { piece, square } of pieceSquares) {
    if (piece.color === chess.turn() || !['q', 'r', 'b', 'n'].includes(piece.type)) continue;
    const attackers = chess.attackers(square, opposite(piece.color));
    if (attackers.length < 2) continue;
    const defenders = chess.attackers(square, piece.color);
    if (defenders.length === 1) {
      const defender = defenders[0];
      const defendedTargets = pieceSquares.filter((entry) => entry.piece.color === piece.color && ['q','r','b','n'].includes(entry.piece.type) && chess.attackers(entry.square, piece.color).includes(defender)).length;
      if (defendedTargets >= 2) themes.add('Overloaded pieces');
    }
  }
  return THEME_NAMES.filter((name) => themes.has(name));
}

export function explainMove({ beforeFen, afterFen, move, bestLine = '' }) {
  const facts = [];
  try {
    const before = new Chess(beforeFen); const after = new Chess(afterFen);
    const played = before.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), ...(move.uci[4] ? { promotion: move.uci[4] } : {}) });
    const movedPiece = after.get(move.uci.slice(2, 4));
    if (played?.san.includes('#')) facts.push('It delivers checkmate.');
    else if (played?.san.includes('+')) facts.push('It gives check and forces the opponent to respond to the king threat.');
    if (played?.captured) facts.push(`It captures a ${played.captured === 'q' ? 'queen' : played.captured === 'r' ? 'rook' : played.captured === 'b' ? 'bishop' : played.captured === 'n' ? 'knight' : 'pawn'}.`);
    if (played?.flags.includes('k') || played?.flags.includes('q')) facts.push('Castling moves the king toward safety and brings a rook into play.');
    if (played?.promotion) facts.push(`The pawn promotes to a ${played.promotion === 'q' ? 'queen' : played.promotion}.`);
    if (played?.piece === 'p' && ['d4','e4','d5','e5'].includes(played.to) && !played.captured) facts.push('The pawn claims central space and opens lines for the bishop and queen.');
    if (['n','b'].includes(played?.piece) && ['1','8'].includes(played.from[1]) && !['1','8'].includes(played.to[1])) facts.push('The minor piece develops toward the center and gains influence over more squares.');
    if (movedPiece && ['n', 'b', 'r', 'q'].includes(movedPiece.type)) {
      const movedTo = move.uci.slice(2, 4);
      const attacked = after.board().flatMap((rank, ri) => rank.map((piece, fi) => piece ? { piece, square: `${'abcdefgh'[fi]}${8-ri}` } : null).filter(Boolean))
        .filter((entry) => entry.piece.color !== movedPiece.color && ['q','r','b','n'].includes(entry.piece.type) && after.attackers(entry.square, movedPiece.color).includes(movedTo));
      const valuable = [...new Set(attacked.map((entry) => entry.piece.type))];
      if (valuable.length >= 2) facts.push('The moved piece creates a fork, attacking more than one valuable enemy piece.');
      else if (attacked.length) facts.push(`The move creates a direct attack on the enemy ${attacked[0].piece.type === 'q' ? 'queen' : attacked[0].piece.type === 'r' ? 'rook' : 'minor piece'}.`);
    }
    const themes = detectThemes(afterFen);
    if (themes.includes('Hanging pieces')) facts.push('A valuable piece appears tactically loose in the resulting position.');
    if (themes.includes('King safety')) facts.push('The king position is under direct attack, so king safety needs attention.');
    if (themes.includes('Back-rank threats')) facts.push('A back-rank threat may become relevant because the king has limited escape squares.');
    if (facts.length === 0) facts.push('The move improves the position by changing piece placement; compare the engine continuation to see the concrete follow-up.');
    if (bestLine) facts.push(`A strong continuation to consider is ${bestLine}.`);
    return { text: facts.join(' '), themes };
  } catch { return { text: 'Could not reconstruct this move from the saved game position.', themes: [] }; }
}

export function getThemeNames() { return [...THEME_NAMES]; }
