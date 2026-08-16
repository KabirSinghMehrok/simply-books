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

Since the initial build, browser testing against real EPUBs (the "human
gate" — behavior a compiler can't check) surfaced and fixed six real bugs,
every one of them invisible to `tsc`:

1. Importing almost any single-author EPUB crashed on add.
2. Clicking any chrome or rail control also turned the page — which is what
   made pause and skip appear to jump back to an earlier page.
3. Pause didn't pause: it spoke on to the next sentence and re-armed itself.
4. Click-to-turn-page inside the book never worked at all — a realm-bound
   `instanceof` check threw on every click before it could navigate.
5. Frontmatter/cover images wrapped in `<svg>` rendered badly distorted.
6. Jumping sections mid-playback threw from inside foliate-js's `tts.js`.

See [Lessons from real EPUBs](#lessons-from-real-epubs) below.

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
- **The page follows the TTS voice via `scrollToAnchor` in our own TTS
  highlight callback**, not by calling `view.next()`. This is what makes it
  work identically in both paginated and scrolled modes.
- **Don't use `view.initTTS()`.** It takes a granularity argument and
  nothing else: it hardcodes its own highlight callback and silently drops
  any second argument you pass. That callback also calls
  `scrollToAnchor(range, true)`, which *selects* each spoken sentence —
  leaving a live DOM selection that suppresses click-to-turn-page for the
  whole session. `useFoliate.ts`'s `ensureTts()` constructs `TTS` from
  `foliate-js/tts.js` directly so the callback is ours: it draws the accent
  underline and scrolls with `select: false`.
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
  touching `src/tts/driver.ts`. **`pause()` needs the same guard**: it was
  the one path that cancelled without first bumping the generation, so the
  synchronous `onend` ran `nextSentence()` and pause carried on speaking,
  dragging the page after it and flipping the button straight back.
- **A TTS queue belongs to the section that produced it.** Mark names are
  per-block integers valid only for the instance that emitted them, so
  after a TOC jump or rail seek the driver drops its queue rather than
  hand a stale mark to a freshly built `TTS` (which throws inside
  `tts.js` on ranges it hasn't populated yet).
- **Cover/frontmatter images are usually an `<svg>` wrapper, not `<img>`.**
  The paginator forces `max-height`/`max-width`/`object-fit` onto every
  image, but `object-fit` does nothing to an inline `<svg>` — so
  `width="100%"` stretched the box across the column while `max-height`
  clamped it, badly distorting the frontispiece. Those three are set inline
  with `!important` and can't be overridden from a stylesheet, but the
  paginator never writes `width`, so `theme-inject.ts` sets
  `svg[viewBox] { width: auto }`.
- **The spoken-sentence underline uses the CSS Custom Highlight API**
  (`::highlight()` + `CSS.highlights`), not DOM mutation — wrapping the
  spoken range in an element would risk interfering with foliate-js's own
  live block/sentence walk over the same document.
- **The book's iframe is same-origin but still a separate browsing
  context** — clicks, keys, and mouse movement inside it never bubble to
  the parent window, so `src/reader/interactions.ts` is attached to the
  outer window *and* to every section document. Swipe navigation needed no
  code at all — foliate-js's paginator already attaches its own touch
  handlers to every section document.
- **Keys and click zones have deliberately different scopes.**
  `attachKeys` goes on the window, so paging still works while a chrome
  control has focus. `attachClickZones` goes only on the book container and
  each section document — never the window — because the chrome, rail and
  TOC are *siblings* of that container, so a listener scoped there simply
  never sees their clicks. The tempting alternative (one window listener
  that ignores clicks landing inside the chrome) does not work: React can
  replace the clicked node during the click's own dispatch — play and pause
  are different components, so the icon is a different element — and a
  bubble-phase listener then gets a target already detached from the
  document, whose `.closest()` matches nothing. Pressing pause turned the
  page back for exactly that reason.
- **`instanceof` is realm-bound.** Nodes and documents inside the book's
  iframe are *not* instances of the parent window's `Element`/`Document`,
  so `doc instanceof Document` is false for a section document and every
  such check silently takes the wrong branch. `interactions.ts` duck-types
  instead (`target.ownerDocument ?? target`).
- **A section's iframe is as wide as the whole column strip** (7680px for a
  long chapter), not the viewport. Click zones must be computed in viewport
  coordinates — via `defaultView.frameElement`'s rect — or every click
  lands in the "left third" and only ever pages backwards.
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

The wider lesson from the rest of the fixes: **`tsc` passing means very
little here.** The hand-written declarations are an assertion about an
untyped library, not a check of it — they claimed `initTTS` took a
highlight callback (it doesn't) and that `author` was always an array (it
isn't), and the compiler cheerfully agreed with both. Every remaining bug
was equally silent: no exception, just a page that turned when it
shouldn't, a pause that didn't pause, or an image with the wrong aspect
ratio. Anything touching foliate-js or Web Speech has to be opened in a
browser with a real book before it's believed.

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
