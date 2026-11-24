# Stockfish Helper

A local browser chess app for playing against Stockfish, editing continuations, and reviewing positions. Games, settings, and history stay in your browser.

## Start it

Requirements: Node.js 20 or newer.

```sh
npm install
npm run download:engine
npm run dev
```

Open the local address printed by Vite. The Stockfish engine runs in a browser Web Worker. No paid API or cloud account is needed. The initial engine download requires internet access; after download, the engine files are served by the local app.

## Local board theme

The app includes the Green board (`assets/9rdwe.png`) and Neo piece sprites (`assets/ejgfv/*.png`). The production build copies these images to `dist/assets/`; if an image is missing, the app falls back to built-in colors and Unicode pieces.

## First build scope

- Stockfish 19 Lite, single-threaded WebAssembly engine
- White or Black player side; one-click orientation flip
- Strength and search-depth selectors; analysis with evaluation and three candidate lines
- Timed games, position review with inaccuracy/mistake/blunder labels, and move replay
- PGN import/export and custom FEN positions
- Searchable, favoritable browser-local match history and active game recovery
- Undo your move and undo the bot move to choose a manual replacement
- Resizable board
- All match records saved in browser local storage

Only Stockfish is connected in this build. Match records stay in the current browser profile and are not synced across devices. Opening names and natural-language tactical explanations are not included yet.

## Engine licensing

Stockfish and Stockfish.js are distributed under GPL-3.0. The engine files are downloaded separately by `npm run download:engine` and are excluded from this repository. See the included engine `Copying.txt` after downloading and [the upstream project](https://github.com/nmrugg/stockfish.js).

## Technology

- Vite development server
- Plain JavaScript, HTML, and CSS
- `chess.js` for legal move validation and game state
- Stockfish.js WebAssembly running locally in a Web Worker

