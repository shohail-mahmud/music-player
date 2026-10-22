# Vesper

**A lightweight local music player for Windows, with a floating glass desktop widget.**

Vesper plays the music files already on your machine. You import a folder once — it becomes a
playlist built from the real metadata inside those files — and from then on you can control
playback either from the library window or from a translucent mini-player that floats above your
other applications. No account, no cloud, no telemetry, no network requests.

```
┌──────────────────────────────────────────────┬─────────────────────┐
│  Vesper — Local Music            ─ □ ✕       │ ░░ glass widget ░░  │
│  ┌────┬────────────────────────────────────┐ │  ▢  Slow Glass      │
│  │ ▤  │  Your music, kept local.           │ │     Ilse Varga      │
│  │ ⚙  │  ┌ Import Music ┐  ┆ Desktop widget│ │     ──────●── 1:22  │
│  │    │  │ Import Folder │  ┆ Keyboard     │ │      ⏮  ▶  ⏭        │
│  └────┴────────────────────────────────────┘ │                     │
│  01  Nocturne Sessions ………………………… 4 tracks │                     │
│  ─────────────────────────────────────────── │                     │
│  ▶  Slow Glass · Ilse Varga · 4:14   ──●──   │                     │
└──────────────────────────────────────────────┴─────────────────────┘
```

---

## 1. What is implemented

### Library window
* **Home** — branding, a prominent *Import Music* panel with **Import Folder** and **Import Track**
  actions, folder playlists listed as a ruled table of contents, individual tracks in a dense
  editorial table, keyboard reference, and designed empty states.
* **Import Folder** — native directory picker → scan → a folder playlist named after the folder.
  Multiple folders can be imported; each keeps its own display name, path and scan policy.
* **Import Track** — native file picker, one or many files. Only the selected files are added;
  the parent directory is never scanned or imported.
* **Folder playlist screen** — display name (inline-editable, the folder on disk is never renamed),
  real path, track count, total runtime, added/scanned dates, **Play All**, **Shuffle**, per-track
  playback and a *Manage* menu (refresh, nested-scan policy, rename, remove).
* **Library management** — add folders, import tracks, refresh a folder, remove a folder or a
  single entry. **Removing anything never deletes a file** — only the library entry is dropped.
* **Recovery** — if a folder or drive disappears the entry is preserved and the screen shows a
  recovery banner with a *Try again* action. A playlist is never silently erased.

### Desktop widget (signature feature)
* A real second Tauri window (`index.html?window=widget`), not a div floating inside the library.
* Translucent smoked glass: dark neutral base, blurred backdrop, thin white border, inner top
  highlight, soft shadow, rounded corners, artwork, high-contrast transport, thin progress with
  tabular timecodes.
* Independent window: draggable, resizable (260–560 × 88–340), configurable always-on-top (off by
  default), opacity 55–100 %, compact and expanded sizes, optional artwork / progress / volume,
  hide without stopping music, reopen from the library window or the player bar.
* Every control is wired to the shared playback engine — play/pause, previous/next, seek, volume,
  shuffle, repeat — and both windows stay in sync in both directions.

### Playback engine
* Play, pause, resume, stop, previous, next, seeking, volume, mute.
* Shuffle (Fisher–Yates play order, current track kept first when toggled mid-playback, no repeats
  inside a shuffle cycle), repeat off / all / one, automatic end-of-track progression, queue
  management, error recovery (a missing or undecodable file is reported and skipped, not fatal).
* The engine is owned by the Rust `AppState`/`PlaybackService`, not by a window: hiding or closing
  the library window while the widget is showing keeps the music playing (the close request is
  converted into a hide).

### Persistence
* SQLite (`rusqlite`, bundled) at `%LOCALAPPDATA%\Vesper\library.db` — folders, tracks, playlist
  membership and order, display names, metadata cache, last playlist, volume, mute, shuffle,
  repeat, widget visibility / always-on-top / opacity / size / position / dimensions and the last
  track and position. Survives restarts, Windows restarts and app updates.

### Metadata & artwork
* `lofty` reads title, artist, album, duration and embedded artwork. Fields the file does not carry
  stay empty and the UI falls back to the file name — **no artist or album is ever invented**.
* Artwork is written once to the per-user artwork cache and rendered as small thumbnails; the UI
  never decodes every full-resolution cover at once.
* Scanning and tag extraction run off the UI thread; the import progress strip stays responsive.

### Privacy
* Files are read **in place** and never copied into application storage.
* No analytics, no telemetry, no network requests, no account, no external server.
* Path access is limited to folders the user actually imported.

---

## 2. Technology

| Layer | Choice |
| --- | --- |
| UI | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4 |
| Desktop shell | Tauri 2 (`tauri-plugin-dialog`, `tauri-plugin-opener`) |
| Audio | `rodio` + `symphonia` (cpal output on Windows) |
| Metadata | `lofty` |
| Database | SQLite via `rusqlite` (bundled) |
| CI | GitHub Actions, `windows-latest` |

**Format support** depends on the decoder, not on the file extension:
* Desktop (rodio/symphonia): MP3, WAV, FLAC, M4A/AAC (ISO-MP4), OGG Vorbis, Opus.
* Browser preview (Chromium media stack): MP3, WAV, FLAC (where the browser supports it), M4A/AAC, OGG/Opus.
* WMA and AIFF are accepted by the scanner but may fail to decode — the app reports the error and
  skips to the next track instead of stalling. Nothing is claimed as supported that has not been
  exercised; see `TESTING.md`.

---

## 3. Running it locally

### Requirements
* Node.js 20+ and npm
* Rust 1.77+ (`rustup`) with the MSVC toolchain — `rustup default stable-msvc`
* Windows 10/11 with the WebView2 Runtime (preinstalled on Windows 11)
* For MSI output: the WiX Toolset is downloaded automatically by the Tauri CLI

### Browser preview (no Rust required)

```bash
npm ci
npm run dev          # http://localhost:5173
```

The preview uses the same store and components as the desktop build. Imported files are played by
the HTML5 audio engine and read through a real ID3 reader, so importing, browsing, playback,
seeking, queueing and the widget all genuinely work. Open `http://localhost:5173/?window=widget`
in a second tab to see the widget window on its own — state is mirrored through a
`BroadcastChannel`, exactly as the desktop build mirrors it through Tauri events.

The bundled **sample collection** exists only so the interface can be evaluated before importing
anything. It is labelled *Sample* everywhere it appears and can be removed in
**Settings → Data & privacy**. Its transport advances in real time but produces no audio; files you
import always play real sound.

### Desktop build

```bash
npm ci
npx tauri dev        # live reload, opens the library window
```

Generate the icon set once before bundling (the repository keeps only the vector source):

```bash
node scripts/make-icon.mjs
npx tauri icon src-tauri/icons/source.png
```

```bash
npx tauri build      # frontend build + Rust release build + MSI & NSIS installers
```

Artifacts land in `src-tauri/target/release/bundle/`.

### Tests

```bash
node scripts/test.mjs     # tsc + node --test (no extra dependencies)
npx tsc --noEmit          # type check
```

---

## 4. Windows build in CI

Workflow: `.github/workflows/windows-build.yml`

1. Triggers on push, tags (`v*`), pull requests and manual dispatch.
2. `windows-latest` runner, Node 20, `npm ci`, Rust stable (MSVC) with build caching.
3. `npx tsc --noEmit` → `node scripts/test.mjs` → `npm run build` → icon generation → `npx tauri build`.
4. A verification step fails the job if no MSI/NSIS output exists — the workflow never reports
   success without a real artifact.
5. **Download**: repository page → *Actions* → the run → *Artifacts* →
   `vesper-windows-<commit sha>` (retained 30 days). It contains `vesper.msi`,
   `Vesper_0.1.0_x64-setup.exe` (NSIS) and the raw `vesper.exe`.

> **Signing status: UNSIGNED.** No certificate or secret is configured, so the installers are not
> code-signed. Windows SmartScreen will show *“Windows protected your PC”* on first run and the
> publisher will be listed as unknown. To sign, configure a code-signing certificate and set
> `TAURI_SIGNING_PRIVATE_KEY` / the Windows signing fields in `tauri.conf.json`; do not commit
> certificates, keys or tokens.

---

## 5. Project layout

```
src/
  types.ts                  shared domain model (mirrors src-tauri/src/model.rs)
  lib/                      pure logic: paths & identity, shuffle/queue policy,
                            import policy, ID3 reader, formatting
  state/
    bridge.ts               typed Tauri command/event boundary + browser fallbacks
    store.ts                shared state + playback engine (one instance, both windows)
    sampleCollection.ts     clearly-labelled preview content
  components/               window chrome, home, playlist, settings, player bar, widget
src-tauri/
  src/model.rs              serialisable types
  src/db.rs                 SQLite library in %LOCALAPPDATA%\Vesper
  src/metadata.rs           lofty tag + artwork extraction
  src/library.rs            scanning, de-duplication, path policy
  src/playback.rs           rodio playback service + queue policy
  src/commands.rs           Tauri command surface
  src/lib.rs                lifecycle, state broadcasting, window behaviour
  capabilities/default.json least-privilege window/dialog permissions
tests/                      node --test suites for the pure logic
scripts/                    test runner, icon generator
```

---

## 6. Import policy (explicit)

* **Nested directories** — a folder scan reads only files sitting directly inside the folder
  unless *Include nested folders* is on (Settings) or the playlist's *Manage → Scan nested
  folders* toggle is set for that folder. The default is deliberately non-recursive so importing a
  drive root cannot silently pull in tens of thousands of files.
* **Identity & duplicates** — a track is identified by the normalised path (separators unified,
  case folded, `.`/`..` collapsed). Re-importing the same folder is idempotent. A second guard on
  the `(size, duration)` signature prevents a moved or renamed file from appearing twice in the
  same collection.
* **Individual tracks** — only the selected files are added. The parent folder is never imported.
* **Never destructive** — removing an entry does not touch the file system.

---

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `cargo build` fails on a `rodio` feature name | Feature names drift between rodio releases. Use `default-features = true` with `features = ["symphonia-all"]` in `src-tauri/Cargo.toml`, or pin `rodio = "=0.20"`. |
| `failed to find icon` during `npx tauri build` | Run `node scripts/make-icon.mjs` then `npx tauri icon src-tauri/icons/source.png`. |
| Widget window is invisible after enabling it | The widget starts hidden on purpose; Settings → Desktop widget → *Show the desktop widget*, or press `W`. |
| Transparent window shows black | Transparency needs Windows 10 1809+ and the WebView2 runtime. Set `"transparent": false` in `src-tauri/tauri.conf.json` for a solid fallback. |
| Fonts look like a system fallback | Google Fonts is loaded from the network in the preview. For a fully offline desktop build, self-host Fraunces + IBM Plex Sans/Mono in `public/fonts` and point `index.html` at them. |
| Audio device error at startup | `rodio` could not open an output device (e.g. no playback endpoint). The library and settings still load; the player bar shows the error and recovers when a device appears. |
| `npm ci` fails on lockfile drift | Run `npm install` locally to refresh `package-lock.json` and commit it. |

---

## 8. Known limitations

* The Rust/Tauri layer is written against Tauri 2, rodio 0.20 (symphonia) and lofty 0.21. It has
  **not** been compiled in the environment where this repository was authored — expect at most
  ordinary dependency-version adjustments on first `cargo build`. Everything in `src/` is compiled,
  type-checked and tested here.
* Windows global media keys are not registered. The shortcuts listed in the app are application
  shortcuts and are described as such.
* The widget is not click-through and has no per-corner snap; dragging is free-form.
* Duration for imported files is probed from the container header; some VBR MP3s report a slightly
  approximate length until they are played through.
* Artwork cache growth is not garbage-collected automatically (delete `%LOCALAPPDATA%\Vesper\artwork`
  to clear it).
