# Stockfish Helper

A local browser chess app for playing against Stockfish or Maia-3. Stockfish plays for strength; Maia models human move choices at a selected rating. The app also supports editable continuations, game review, custom positions, and saved matches. Games, settings, and history stay in your browser.

## Run the browser app

Requirements: Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Stockfish and Maia's model checkpoint are included in the project. For the development version, Maia also needs its Python engine dependencies installed on the development computer.

## Build the offline Windows app

The Windows desktop build uses a local window and a temporary `127.0.0.1` port for its frontend. The packaged app blocks web requests to other hosts. Its installer includes the board assets, Stockfish, the Maia checkpoint, and Maia's Python runtime and libraries, so the receiving laptop does not need Node.js, Python, or an internet connection.

To create the installer, use a Windows build computer with Node.js 20+, Git, Python 3.12, and internet access for the one-time build downloads:

```powershell
npm install
npm run package:windows
```

The installer is written to `release/Chess-Helper-Setup-0.1.0.exe`. The Maia CPU runtime is large; expect a multi-hundred-megabyte installer. The finished app itself runs offline. `npm run desktop` runs the desktop shell for development, while `npm run dev` continues to run the browser app.

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

Match records stay in the current browser profile and are not synced across devices. Opening names and natural-language tactical explanations are not included yet.

## Local engines

The Stockfish JavaScript/WebAssembly engine files, Maia-3 inference source, and Maia-3 5M checkpoint are stored in this project. Gameplay does not fetch model files or call a remote inference service.

Stockfish runs directly in the browser. Maia-3 uses the bundled source in `vendor/maia3` and the `models/maia3-5m.pt` checkpoint. The Windows packaging step compiles Maia and its Python dependencies into an app-local runtime. The app passes Maia the checkpoint path and complete game history, so it does not fetch weights from Hugging Face.

The browser development setup uses Node.js and a local Maia Python install. Only the Windows release bundles Maia's Python runtime and dependencies. Noctie has no public local model/engine package available to integrate.

## Engine licensing

Stockfish and Stockfish.js are distributed under GPL-3.0; see `public/engine/Copying.txt` and [the upstream project](https://github.com/nmrugg/stockfish.js). Maia-3 code is distributed under AGPL-3.0; see `models/AGPL-3.0.txt` and [the Maia-3 repository](https://github.com/CSSLab/maia3). The Maia-3 model card describes the weights as covered by the repository's code/weights license; see [the official 5M model card](https://huggingface.co/UofTCSSLab/Maia3-5M).

## Technology

- Vite development server
- Plain JavaScript, HTML, and CSS
- `chess.js` for legal move validation and game state
- Stockfish.js WebAssembly running locally in a Web Worker



## Third-party Maia source

The source under `vendor/maia3` is copied from the official [CSSLab Maia-3 repository](https://github.com/CSSLab/maia3) and remains under its included AGPL-3.0 license. The model checkpoint and required notices are stored under `models/`.
