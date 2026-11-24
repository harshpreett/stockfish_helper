# Stockfish Helper

A local browser chess app for playing against configurable chess engines. The first build includes a browser-based Stockfish engine, selectable side, board flipping and resizing, saved local match history, and undo controls that let you replace the bot's last move.

## Start it

Requirements: Node.js 20 or newer.

```sh
npm install
npm run download:engine
npm run dev
```

Open the local address printed by Vite. The Stockfish engine runs in a browser Web Worker. No paid API or cloud account is needed. The initial engine download requires internet access; after download, the engine files are served by the local app.

## Local board theme

The app can load the Green board and Neo piece art from `assets/9rdwe.png` and `assets/ejgfv/*.png`. These files are local-only and ignored by Git. Put the 12 piece sprites (`wp.png`, `wn.png`, `wb.png`, `wr.png`, `wq.png`, `wk.png`, and their `b*` equivalents) in `assets/ejgfv/`. The production build copies the images it finds into `dist/assets/`; if they are missing, the app falls back to its built-in board colors and Unicode pieces.

## First build scope

- Stockfish 19 Lite, single-threaded WebAssembly engine
- White or Black player side; one-click orientation flip
- Strength selector and browser-local match history
- Undo your move and undo the bot move to choose a manual replacement
- Resizable board
- All match records saved in browser local storage

Leela Chess Zero, Maia, engine import controls, timers, analysis, and PGN export are planned additions. Match records stay in the current browser profile and are not synced across devices.

## Engine licensing

Stockfish and Stockfish.js are distributed under GPL-3.0. The engine files are downloaded separately by `npm run download:engine` and are excluded from this repository. See the included engine `Copying.txt` after downloading and [the upstream project](https://github.com/nmrugg/stockfish.js).

## Technology

- Vite development server
- Plain JavaScript, HTML, and CSS
- `chess.js` for legal move validation and game state
- Stockfish.js WebAssembly running locally in a Web Worker

