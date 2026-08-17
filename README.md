# Simply Book

A free, fully client-side EPUB reader with text-to-speech. No backend, no
accounts, no per-user cost — everything runs in the browser and ships as
static files.

## Features

- Add EPUB files by picking or dragging them in — stored locally in
  IndexedDB, nothing leaves the browser
- Reading view with keyboard, click-zone, and swipe navigation, plus a
  table of contents panel
- Settings panel: 4 reading themes (Paper/Ink/Dusk/Slate), font choice,
  size and line height, and single-page / two-page / scrolled layout —
  all applied live, mid-book
- Text-to-speech that reads sentence by sentence, highlights the sentence
  being spoken, and turns the page on its own as it goes
- Two TTS engines: the browser's built-in voices (System), or an opt-in
  natural voice (Piper, ~63 MB, downloaded once and cached in the browser).
  Pressing play on an undownloaded natural voice starts that download
  automatically and reads with the system voice in the meantime, switching
  over once it's ready
- Play/pause, skip to the previous/next sentence, and a "read this page"
  button that restarts reading from whatever's currently on screen
  (independent of where playback last stopped)
- Lock-screen / notification playback controls (Media Session) — play,
  pause, and skip from outside the browser tab
- A reading progress rail you can click to jump to any point in the book
- Resumes exactly where you left off after a refresh
- Highlights (4 colors) and notes — select text for a color/note toolbar,
  overlapping highlights merge (new color wins, notes concatenate), and
  highlights survive navigating away and back
- See [ROADMAP.md](ROADMAP.md) for what's next

## Stack

| | |
|---|---|
| UI | React 19 + TypeScript, plain CSS (no framework) |
| Build | Vite |
| EPUB rendering | [foliate-js](https://github.com/johnfactotum/foliate-js) |
| Text-to-speech | Browser-native Web Speech API, plus [Piper](https://github.com/rhasspy/piper) (via `@mintplex-labs/piper-tts-web`) as an opt-in natural voice, running in a Web Worker |
| Storage | IndexedDB via [`idb`](https://github.com/jakearchibald/idb) |
| Icons | [lucide-react](https://lucide.dev) |

See [ROADMAP.md](ROADMAP.md) for why these were chosen over the alternatives.

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build a static production bundle
npm run preview  # serve the production build locally
```

No environment variables, no API keys, no backend to run.

## Project structure

```
src/
  App.tsx                 switches between the library and reader views
  settings.ts              loads/persists appearance settings, applies them to <html>
  themes.css               reading theme tokens (fonts, colors)
  library/
    db.ts                  IndexedDB storage (books, progress, settings)
    meta.ts                 safely reads EPUB metadata (title/author)
    Library.tsx             book grid, add/drag-drop, delete
  reader/
    useFoliate.ts           owns the foliate-js <foliate-view> element
    interactions.ts         click-zone/keyboard navigation, text selection
    annotations.ts          highlight overlap/merge math (Node-testable, no DOM)
    useAnnotations.ts        persists highlights, applies merges against the live view
    theme-inject.ts         injects reading theme + TTS highlight into the book
    Reader.tsx              composes the reader view
    Chrome.tsx              top bar + TTS controls
    SettingsPanel.tsx        appearance/layout/voice settings (native popover)
    SelectionToolbar.tsx     highlight color / note picker on text selection
    NoteEditor.tsx           add/edit/remove a highlight's note
    Rail.tsx                progress rail
    Toc.tsx                 table of contents panel
  tts/
    ssml.ts                 parses foliate-js's per-sentence SSML output
    driver.ts               the TTS playback state machine, engine-agnostic
    engine.ts                the SpeechEngine interface + Web Speech implementation
    piper-engine.ts          main-thread half of the Piper (natural voice) engine
    piper.worker.ts          runs Piper/ONNX inference off the main thread
    piper-protocol.ts        message types shared by piper-engine.ts and piper.worker.ts
  types/
    foliate-view.d.ts       hand-written types for foliate-js (it ships none)
    foliate-epubcfi.d.ts    hand-written types for foliate-js's CFI module
    foliate-overlayer.d.ts  hand-written types for foliate-js's highlight renderer
public/fonts/               self-hosted variable fonts (OFL-licensed)
```

## Deploying

The build output (`dist/`) is fully static — any static host works
(Cloudflare Pages, GitHub Pages, etc.). There's no server component.

## License

Project code has no license file yet — treat as all rights reserved until
one is added. Third-party: foliate-js is MIT-licensed; the bundled fonts
(Instrument Sans, Literata, Source Serif 4, Crimson Pro, Atkinson
Hyperlegible) are SIL Open Font License 1.1 — see `public/fonts/OFL-*.txt`.
