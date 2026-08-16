# Roadmap

## Status: v0 shipped

Everything below is built, type-checked, and committed:

- Vite + React + TypeScript scaffold, dependencies pinned, all 4 reading
  themes defined in CSS (only Paper is wired up to a UI yet)
- Hand-written TypeScript types for foliate-js (it ships none)
- IndexedDB storage layer (books, reading progress, settings) and safe
  EPUB-metadata readers
- Library grid: add by file picker or drag-drop, covers, delete, per-book
  progress
- The reader: opens a book, renders a two-page spread, resumes at the
  exact saved position after a refresh
- SSML-to-speech parsing and the sentence-by-sentence TTS playback engine
- The reader chrome: top bar, TTS controls, progress rail, table of
  contents, keyboard/click-zone/swipe navigation, idle-fade UI

Since the initial build, real-EPUB testing (the "human gate" — behavior a
compiler can't check) surfaced and fixed one real bug: importing almost any
real-world single-author EPUB crashed on add. See
[Lessons from real EPUBs](#lessons-from-real-epubs) below.

## Technical decisions

### EPUB rendering: foliate-js, not epub.js

| | foliate-js | epub.js |
|---|---|---|
| Last released | 2025 | 2022 (effectively unmaintained) |
| Text-to-speech | Built in — generates per-sentence SSML with position markers | None; would need to be hand-built |
| Paginated ⇄ scrolled | Switches without reloading | Requires a re-render |
| Dependencies | 1 | Several |
| Known issues | API still called "not stable" by its own author | Open memory-leak reports with zipped EPUBs |

foliate-js's built-in TTS support (SSML generation, sentence-range
highlighting) is the deciding factor — it's the single hardest part of this
app, and hand-rolling it on top of an unmaintained library was the
alternative. The cost: foliate-js ships no TypeScript types and its own
README shows an API call that doesn't actually work (see below), so its
surface is hand-typed in `src/types/foliate-view.d.ts` from source, not docs.

### Text-to-speech: the browser's built-in Web Speech API

| Engine | Download | Works on mobile | Notes |
|---|---|---|---|
| **Web Speech API** (chosen) | 0 MB | Yes | Quality depends on OS voices — genuinely good on macOS/iOS/Android, weaker on Windows |
| Kokoro-82M (neural, WebGPU) | ~86 MB | **No — runs out of memory on mobile tabs** | Best quality, desktop-only |
| Piper (neural, WASM) | ~40–70 MB | Yes (CPU) | Good quality, viable mobile-friendly upgrade path |
| KittenTTS / PocketTTS | 25 MB+ | Marginal | Too immature (dev-preview / community ports) for now |

Mobile support was a stated requirement, which rules out Kokoro as the
default outright — it can only ever be a desktop opt-in. Given that, the
0-download, 0-cost, works-everywhere native API was the right default for
v0, with Piper as the likely first paid-in-effort upgrade (see below) since
it's the only neural option that also runs acceptably on mobile.

### Architecture notes worth knowing before changing this code

- **Layout attributes go on `view.renderer`, not `view`.** foliate-js's own
  README example (`view.setAttribute('flow', ...)`) is a silent no-op —
  `View` doesn't forward attributes to the internal `Paginator`.
- **The page follows the TTS voice via `scrollToAnchor` inside the
  `initTTS` highlight callback**, not by calling `view.next()`. This is
  what makes it work identically in both paginated and scrolled modes.
- **`view.next()` resolving does not mean TTS is ready for the new
  section.** The `load`-event listener that re-initializes TTS per section
  is fire-and-forget, not awaited by `next()`. `useFoliate.ts` exports
  `ensureTts()` so both the background pre-warm and the TTS driver's
  section-advance path can await the same idempotent setup instead of
  racing each other.
- **Every `SpeechSynthesisUtterance` callback is generation-guarded.**
  Calling `speechSynthesis.cancel()` fires the outgoing utterance's
  `onend` synchronously, so without a generation counter, skipping to the
  next/previous sentence double-advances the queue. This is the most
  common bug in Web Speech integrations, and it's silent — no error, just
  an occasional dropped sentence — so it's worth re-checking by hand after
  touching `src/tts/driver.ts`.
- **The spoken-sentence underline uses the CSS Custom Highlight API**
  (`::highlight()` + `CSS.highlights`), not DOM mutation — wrapping the
  spoken range in an element would risk interfering with foliate-js's own
  live block/sentence walk over the same document.
- **The book's iframe is same-origin but still a separate browsing
  context** — clicks, keys, and mouse movement inside it never bubble to
  the parent window. `src/reader/interactions.ts` is attached twice (once
  to the outer window, once per section document) for exactly this reason.
  Swipe navigation needed no code at all — foliate-js's paginator already
  attaches its own touch handlers to every section document.
- **iOS requires the first `speechSynthesis.speak()` call to happen
  synchronously inside a user gesture.** TTS is pre-warmed on the `load`
  event, never awaited inside the play button's click handler — awaiting
  anything there breaks it silently on iPhone specifically.
- **Bundle budget:** the initial load is ~75 KB gzipped. foliate-js's
  non-EPUB format parsers (MOBI, FB2, comic book, fixed-layout) are
  separate lazy chunks, only downloaded if a book actually needs them.

### Lessons from real EPUBs

The type declarations and code above were written directly from
foliate-js's source, but one behavior only showed up when actually
importing real files: **epub.js (which foliate-js uses internally for EPUB
parsing) runs all metadata through a `tidy()` step that collapses
single-item arrays and single-key objects down to their bare value.** So
`metadata.author` is an array only for books with *two or more* authors —
the overwhelmingly common single-author case yields a plain string or a
bare `{lang: name}` object instead, and code (and the hand-written types)
that assumed it was always `Contributor[]` crashed on `.map()` for almost
every real book. Fixed in `src/library/meta.ts` (see its comments) and the
type declarations widened to match. This is the kind of thing to watch for
generally with this library: treat its own source as the source of truth
for shape, but don't assume a single example generalizes until it's been
tried against a handful of real, ordinary files.

## What's left

### v1 — not started
- Mobile layout polish (single-column is automatic via CSS container
  queries; touch target sizing and layout polish are not done)
- Highlights and notes
- In-book search
- Theme switcher, font/size/line-height settings (3 of the 4 themes are
  already defined in CSS, just not wired to a UI)
- Single ⇄ two-page toggle, scrolled reading mode

### v2 — not started
- Settings sync polish
- Piper as an opt-in "natural voice" — a one-time ~40–70 MB download,
  the only neural TTS option that also works on mobile

### v3 — not started
- Google Drive / OneDrive import and sync
- Note: Google requires OAuth app verification for Drive scopes before
  general users can use it without an "unverified app" warning — worth
  deciding how to handle before starting this

### Known v0 gaps (deliberate, not oversights)
- No error boundaries, loading skeletons, or offline/service-worker support
- No settings for TTS beyond rate and voice (no per-book memory of a
  preferred voice, for instance)
- The reading-progress rail shows one combined position indicator; TTS
  playback and page position are already kept in sync (the page follows
  the voice), so a second dedicated "TTS playhead" mark was judged
  redundant rather than built blind
