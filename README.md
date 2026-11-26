<div align="center">

# ♞ Stockfish Helper

### A private chess board, local engines, and a clearer way to review your games.

Play against Stockfish or Maia-3, analyse positions, and explore alternate continuations — all on your device.

[![Latest release](https://img.shields.io/github/v/release/harshpreett/stockfish_helper?label=release&color=9aca5b)](https://github.com/harshpreett/stockfish_helper/releases/latest)
![Windows x64](https://img.shields.io/badge/Windows-x64-333?logo=windows)
![Offline play](https://img.shields.io/badge/play-offline-5b8a46)

<br>

[**⬇ Download for Windows**](https://github.com/harshpreett/stockfish_helper/releases/tag/v1.0.0) · [Browse the code](https://github.com/harshpreett/stockfish_helper) · [See the coach ↓](#-game-coach)

</div>

> [!NOTE]
> The Windows installer and portable app include Stockfish, Maia-3, the model checkpoint, and Maia’s CPU runtime. The app needs no internet, Python, or paid API on the computer where you run it. Builds are unsigned, so Windows may show a publisher or SmartScreen warning.

## ✨ What you can do

| ♟ Play | 🔎 Analyse | 📚 Review |
| --- | --- | --- |
| Choose a side, engine, and difficulty | See evaluation and three candidate lines | Replay, import, and export PGN |
| Undo either side and continue from a new line | Get two-move hints with board arrows | Save, search, and favorite matches |
| Flip or resize the board; start from FEN | Adjust Stockfish strength and depth | Review move quality locally |

<p align="center"><b>Your games stay on this device.</b> Match history is stored in the app profile and does not sync across computers.</p>

## 🧭 How it works

```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#24372a','primaryTextColor':'#eff5e9','primaryBorderColor':'#8fb86a','lineColor':'#94ad7c','secondaryColor':'#202a35','tertiaryColor':'#33302a'}}}%%
flowchart LR
  You([Your move]) --> Rules[chess.js checks legality]
  Rules --> Choice{Opponent}
  Choice -->|Engine strength| SF[Stockfish · WebAssembly]
  Choice -->|Human-like play| Maia[Maia-3 · local model]
  SF --> View[Board · hints · evaluation]
  Maia --> View
  View --> History[(Local match history)]
  classDef input fill:#253a2c,stroke:#a7cf73,color:#f4f7ee
  classDef engine fill:#243140,stroke:#8db3d3,color:#f4f7ee
  classDef output fill:#3b3425,stroke:#e6c36f,color:#fff8e8
  class You,Rules input
  class SF,Maia engine
  class View,History output
```

In the Windows build, Electron opens the interface from a temporary local-only server. It accepts requests from the app itself and blocks requests to other hosts. Stockfish runs in a browser worker; Maia uses the included 5M checkpoint and packaged CPU runtime.

## 🧠 Game coach

The coach explains the latest move and both hint candidates using position facts and engine lines. It avoids claiming to know what a player intended. Move review grades both sides’ moves, estimates accuracy from centipawn loss, and tracks detected themes across saved games. Theme recognition is an initial rules-based pass and can miss subtle tactics; performance ratings are not inferred from unrated games.

```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#253a2c','primaryTextColor':'#f4f7ee','primaryBorderColor':'#a7cf73','lineColor':'#91a784','secondaryColor':'#283341','tertiaryColor':'#3c3324'}}}%%
flowchart LR
  Pos[Position before move] --> Facts[Legal moves and tactical patterns]
  Pos --> Lines[Stockfish lines and evaluations]
  Played[Move played] --> Compare[Compare move with alternatives]
  Facts --> Compare
  Lines --> Compare
  Compare --> Explain[Coach: idea · threat · consequence]
  Explain --> Graphs[Graphs: evaluation · quality · candidates]
  classDef source fill:#283341,stroke:#91b6d8,color:#f4f7ee
  classDef coach fill:#253a2c,stroke:#a7cf73,color:#f4f7ee
  classDef visual fill:#3c3324,stroke:#e3c36b,color:#fff8e8
  class Pos,Played,Lines,Facts source
  class Compare,Explain coach
  class Graphs visual
```

### 📊 Coach goals

Coach output and summaries stay local; no game or usage data is sent anywhere. Accuracy is an estimate based on average centipawn loss, not a rating-provider accuracy formula.

| KPI | Initial target | Why it matters |
| --- | --- | --- |
| Explanation coverage | Every reviewed move gets an explanation or “no major change” | Useful feedback across the whole game |
| Evidence traceability | Tactical and evaluation claims link to a line, move, or board feature | Explanations stay specific and checkable |
| Response time | Typical explanation within 2 seconds after analysis | Feedback arrives while the position is fresh |
| Offline availability | All coach features work without a network | Keeps the app private and self-contained |
| Clarity feedback | Helpful/unclear rating saved locally | Lets the coach improve without telemetry |

### 📈 Game graphs to add

| Graph | What it reveals |
| --- | --- |
| **Evaluation timeline** | Advantage swings, with the moves that caused them marked on the graph |
| **Move-quality timeline** | Accuracy or centipawn loss by move, filterable by side |
| **Candidate comparison** | Played move versus top alternatives and their resulting evaluations |
| **Material balance** | Material gained or lost as the game progresses |
| **Phase summary** | Move quality in the opening, middlegame, and endgame, with the scoring method shown |

Coach wording should separate evidence from interpretation. “The queen is attacked” is verifiable; “you played this because…” is an inference and should be presented as a possibility.

<details>
<summary><b>🗺️ Suggested delivery order</b></summary>

1. **Broaden motif checks:** improve precision and coverage for pins, overloads, and discovered attacks.
2. **Visual review:** add evaluation and move-quality graphs linked to the move list.
3. **Optional language model:** more natural phrasing, with claims restricted to verified engine evidence.

</details>

## 🚀 Run it locally

### Browser development

Requires Node.js 20 or newer. Maia’s development version also requires its Python dependencies on the development computer.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Stockfish files and Maia’s checkpoint are already in the project.

### Build the self-contained Windows app

Use Windows, Node.js 20+, Git, and Python 3.12. The **build computer** needs internet once to fetch build dependencies; the resulting installer works offline on the target computer.

```powershell
npm install
npm run package:windows
```

Installer output: `release/Chess-Helper-Setup-1.0.0.exe`. Use `npm run desktop` to run the Electron shell during development, or `npm run dev` for the browser version.

For a **single-file portable app** that runs without installation:

```powershell
npm run package:portable
```

Portable output: `release/Chess-Helper-Portable-1.0.0.exe`. Copy it to a folder or USB drive and run it; first launch extracts bundled files to a temporary folder. The portable build is unsigned.

## 🧰 Project map

| Location | Contents |
| --- | --- |
| `index.html`, `src/` | Interface, game flow, and styling |
| `desktop/` | Electron shell, local server, Maia UCI bridge |
| `public/engine/` | Stockfish JavaScript/WebAssembly and license |
| `models/` | Maia-3 5M checkpoint and notices |
| `vendor/maia3/` | Maia-3 inference source |
| `scripts/package-maia.ps1` | Packages Maia’s CPU runtime |
| `assets/` | Green board (`9rdwe.png`) and Neo pieces (`ejgfv/`) |

## ⚙️ Engines and current limits

- **Stockfish 19 Lite** — single-threaded WebAssembly; skill, depth, analysis, and candidate lines.
- **Maia-3 5M** — human-like move choice at a selected rating; bundled in the Windows release.
- **Noctie** — not included as an offline engine.
- **Coach** — local rule and engine evidence; explanations are deterministic templates, not LLM commentary.
- **Review limits** — accuracy is an estimate; game rating is not inferred; tactical theme checks are preliminary and may miss or overcount patterns.

## 📄 Licenses

Stockfish/Stockfish.js is GPL-3.0 (`public/engine/Copying.txt`). Maia-3 source is AGPL-3.0 (`vendor/maia3/LICENSE`, `models/AGPL-3.0.txt`). Check [`models/README.md`](models/README.md) and the [Maia-3 model page](https://huggingface.co/UofTCSSLab/Maia3-5M) for checkpoint details.
