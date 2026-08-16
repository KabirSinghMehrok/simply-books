# Simply Book

A free, fully client-side EPUB reader with text-to-speech. No backend, no
accounts, no per-user cost — everything runs in the browser and ships as
static files.

## Features (v0)

- Add EPUB files by picking or dragging them in — stored locally in
  IndexedDB, nothing leaves the browser
- Two-page spread reading view with keyboard, click-zone, and swipe
  navigation, plus a table of contents panel
- Text-to-speech that reads sentence by sentence, highlights the sentence
  being spoken, and turns the page on its own as it goes
- Play/pause, skip to the previous/next sentence, and a "read this page"
  button that restarts reading from whatever's currently on screen
  (independent of where playback last stopped)
- A reading progress rail you can click to jump to any point in the book
- Resumes exactly where you left off after a refresh
- Flat, single reading theme (Paper) for now — see [ROADMAP.md](ROADMAP.md)
  for what's next

## Stack

| | |
|---|---|
| UI | React 19 + TypeScript, plain CSS (no framework) |
| Build | Vite |
| EPUB rendering | [foliate-js](https://github.com/johnfactotum/foliate-js) |
| Text-to-speech | Browser-native Web Speech API |
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
  themes.css               reading theme tokens (fonts, colors)
  library/
    db.ts                  IndexedDB storage (books, progress, settings)
    meta.ts                 safely reads EPUB metadata (title/author)
    Library.tsx             book grid, add/drag-drop, delete
  reader/
    useFoliate.ts           owns the foliate-js <foliate-view> element
    interactions.ts         click-zone/keyboard navigation
    theme-inject.ts         injects reading theme + TTS highlight into the book
    Reader.tsx              composes the reader view
    Chrome.tsx              top bar + TTS controls
    Rail.tsx                progress rail
    Toc.tsx                 table of contents panel
  tts/
    ssml.ts                 parses foliate-js's per-sentence SSML output
    driver.ts               the TTS playback state machine
  types/
    foliate-view.d.ts       hand-written types for foliate-js (it ships none)
public/fonts/               self-hosted variable fonts (OFL-licensed)
```

## Deploying

The build output (`dist/`) is fully static — any static host works
(Cloudflare Pages, GitHub Pages, etc.). There's no server component.

## License

Project code has no license file yet — treat as all rights reserved until
one is added. Third-party: foliate-js is MIT-licensed; the bundled fonts
(Instrument Sans, Literata) are SIL Open Font License 1.1 — see
`public/fonts/OFL-*.txt`.
