# Roadmap

## Status: v1 Phase F shipped

- A Highlights & Notes panel (chrome top bar, new highlighter icon next to
  the TOC button): every highlight in the book, sorted into reading order
  via `epubcfi.js`'s own `compare()`, each shown with a word or two of
  context on either side; a note-bearing highlight also shows its note,
  truncated to 50 words. Clicking an entry jumps to it and closes the
  panel, same as a TOC entry
- Context words are captured once, when a highlight is made (or merged),
  and stored on the `AnnotationRecord` -- not resolved live when the panel
  opens. Highlights made before this shipped just show with no context
  rather than needing a backfill pass

## Status: v1 Phase E shipped

- In-book search: a search bar (chrome top bar, new search icon) built
  directly on foliate-js's own `view.search()`/`clearSearch()` -- it already
  walks every section, matches, draws an outline overlay per hit, and
  removes them again, so this feature needed no new highlight-drawing code
  of its own
- Live match count ("x of y"), next/previous buttons that jump between
  matches (wrapping at either end), and a case-sensitivity toggle -- typing
  is debounced 300ms before a search actually runs, since it re-scans the
  whole book every time
- Enter/Shift+Enter in the search input cycle next/previous without
  reaching for the mouse; Escape closes the bar

## Status: v1 Phase D shipped

- Piper as an opt-in natural voice: a `SpeechEngine` abstraction shared with
  Web Speech, Piper running in a Web Worker with the model self-hosted and
  cached in OPFS, one-sentence-ahead prefetch so there's no audible gap at
  sentence boundaries, and the System/Natural toggle in the settings panel
  with a visible download-progress row
- Pressing play on an undownloaded natural voice now auto-starts that ~63 MB
  download and speaks with the system voice meanwhile, upgrading to Piper at
  the next sentence boundary once it lands — no separate "download" gesture
  required. A model that survived a previous download (OPFS) is detected on
  load, so a reload doesn't forget it and re-fetch
- Mobile notification / lock-screen transport controls via the Media
  Session API: play/pause/previous/next drive the same state machine as the
  on-screen buttons, and the notification's play/pause icon stays in sync
  with actual playback state
- Fixed: the paginator's layout attributes (`max-inline-size`, `gap`,
  `margin`) were being set without CSS units, which silently voided the
  shadow-DOM grid and left the book stretched into an auto-sized row
  instead of filling the viewport — see Architecture notes. The margin is
  now viewport-relative and follows window resize/rotation
  live
- Fixed: cancelling playback (pause, skip, engine switch) now always targets
  the engine instance that actually started the current utterance, not
  whichever engine the settings currently name — those two can differ once
  the natural-voice fallback is in play. Piper's own `cancel()` is a hard
  stop (aborts a pending `play()` deterministically) instead of a bare
  `pause()` racing it
- Fixed: changing the voice or rate mid-sentence now restarts that sentence
  immediately in the new voice/rate, instead of silently waiting for the
  next sentence to pick it up
- Settings panel: no more horizontal scrollbar from a long voice name or
  narrow viewport, repositioned to sit above the bottom bar instead of the
  top, and font choices render as buttons in their own real typeface
  instead of a plain `<select>`
- Fixed: on Android Chrome, switching themes left the area behind the
  reader white. `<html>` never had a background of its own (only `body`
  did) — see Architecture notes for where that showed through
- The browser's own chrome (Chrome's address bar, and on Android, the
  on-screen system navigation bar) now matches the active theme, via a
  `<meta name="theme-color">` tag kept in sync on every theme change
- Chapters that begin mid-file (packed into a larger XHTML section rather
  than their own spine item) now always start a fresh column instead of
  running on from the previous chapter's text, using the book's own TOC
  to find them. Doesn't guarantee the left half of a two-page spread
  specifically — see Architecture notes for why that's a materially
  bigger feature, deliberately not built
- Every chapter heading found this way is now set in its own display
  face (Fraunces for the 3 serif themes, Instrument Sans -- already
  loaded for the chrome -- for Slate), centered, with a thin accent-color
  rule beneath it, distinct from the running body text in every theme
- Not shipped: the web app manifest needed for audio to survive
  backgrounding/lock on iOS (a plain Safari tab pauses on lock; only an
  installed PWA gets parity) — still in "What's left" below

## Status: v1 Phase B shipped

- Highlights (4 colors) via a selection toolbar, persisted in IndexedDB,
  redrawn correctly after navigating away and back
- Overlapping highlights merge into one: the new color wins, notes from
  every absorbed highlight concatenate in document order
- Notes: a note always implies a highlight; note-bearing highlights get a
  small floating indicator (anchored to the end of the highlight, not its
  start) that opens an editor to change or remove the note, or delete the
  highlight entirely
- Deleting a book now also deletes its highlights, instead of leaving them
  as permanent orphans in IndexedDB

## Status: v1 Phase A shipped

- Settings panel (top bar gear icon, native HTML Popover API — no
  dependency): all 4 reading themes now wired to a UI (previously only
  Paper was reachable), font-family override, font-size scale, line
  height, and page layout (single-page / two-page spread / scrolled) —
  every one of these applies live to the book already open, not just on
  reopen
- The 3 themes that referenced fonts v0 never downloaded (Source Serif 4,
  Crimson Pro, Atkinson Hyperlegible) now have those fonts self-hosted,
  same as Instrument Sans/Literata
- `SettingsRecord` (`db.ts`) grew `fontFamily`, `fontScale`, `lineHeight`,
  `flow`, `columns`; `getSettings()` now merges the stored row over
  defaults so a record written before this schema grew doesn't come back
  with the new fields `undefined`

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
- **React fires child effects before parent effects within one commit —
  and that broke theme application the first time it was wired up.**
  `useSettings` (called in `App`, a parent) writes the active theme's
  resolved colors/fonts onto `<html>` as CSS custom properties;
  `useFoliate` (used inside `Reader`, a child) re-reads those *resolved*
  values via `getComputedStyle` to re-inject them into the book's iframe,
  since the iframe is a separate Document that doesn't inherit them. Doing
  the `<html>` write in a `useEffect` keyed on `settings` seemed natural,
  but on every settings change React ran the child's effect (which reads
  `getComputedStyle`) *before* the parent's effect (which would have
  updated it) — so the book always re-themed one click behind the chrome,
  silently (no error, and `tsc` had no opinion). Confirmed by browser
  testing per the human gate below, not by a type error. Fixed by having
  `useSettings`'s `update()` write to `<html>` synchronously, in the same
  tick as the state change, instead of in an effect racing against it —
  see `src/settings.ts`.
- **Book fonts are self-hosted from Google Fonts' variable, latin-only
  subset** — same pattern v0 used for Instrument Sans/Literata: a single
  normal-weight face, no italic, `unicode-range` trimmed to latin. Atkinson
  Hyperlegible's only variable release is published under the family name
  "Atkinson Hyperlegible Next" on Google Fonts (the original is
  static-weight only); the local `@font-face` renames it back to "Atkinson
  Hyperlegible" so `themes.css`'s existing `--book-font` value didn't need
  to change.
- **Renderer layout attributes need real CSS units.** `useFoliate.ts`'s
  `setLayout()` was setting `max-inline-size`/`gap`/`margin` to bare numbers
  (`'720'`, `'7'`, `'48'`). `paginator.js`'s `attributeChangedCallback`
  copies each straight into a custom property, and its shadow stylesheet
  computes `grid-template-columns`/`-rows` from those via `calc()` —
  `calc(720 * 2)` is invalid, so the whole grid silently computed to `none`.
  `parseFloat('720')` is still `720`, so the JS-side column-width/gap math
  stayed correct and nothing threw: the book just rendered in an
  auto-sized implicit row instead of filling the viewport. Exactly the
  class of silent failure this file already warns about — verified against
  `paginator.js`'s own default CSS (`--_max-inline-size: 720px`, not
  `720`), not assumed from the JS side working.
- **A Media Session action handler effect must include the state it reads
  in its deps, not just the ref-backed values.** The `play`/`pause`
  handlers close over `play()`, which reads `status` directly (its
  "resume from pause" branch) rather than through a ref. A `[view]`-only
  effect would register once and pin that first render's closure forever,
  so the lock-screen play button would permanently believe `status` was
  `'idle'`. `driver.ts` keys the effect on `[view, status]` instead —
  cheap to re-register on every status change, and the only way the
  handler's closure stays current.
- **`<html>` needs its own background, `body`'s isn't enough on mobile.**
  `body` already carried `background: var(--bg)`, but nothing above it
  did. `<html>`'s bare (browser-default, always white) canvas is exposed
  whenever a mobile browser draws something outside `body`'s own box —
  Android Chrome's URL-bar collapse/expand resize gap and its pull-to-
  refresh/overscroll glow both do this — so a theme switch looked like it
  had no effect on "the background," even though the book's own text area
  (styled via `theme-inject.ts`, scoped inside the section iframe) was
  always correct. Fixed by putting `background: var(--bg)` on `html`
  itself (alongside `body`/`#root`) and adding `overscroll-behavior: none`
  so the glow effect that exposes it doesn't fire in the first place.
  Checked one adjacent theory and ruled it out: `paginator.js`'s shadow-DOM
  gutter-fill element (`#background`) does lose its color on every render
  after the section's first load (`Paginator.render()` calls
  `#beforeRender()` without re-passing a `background`, unlike the initial
  `View.load()` call) — but since `body` already sits directly behind
  that gutter with the correct color, the gutter turning transparent is
  currently invisible; not worth a workaround for a symptom it doesn't
  cause.
- **`theme-color` needs a live element to update, not just a static tag.**
  `<meta name="theme-color">` in `index.html` sets Paper as the default for
  first paint, but a browser tab's toolbar (and Android's on-screen system
  nav bar) only follows theme switches if something rewrites that tag's
  `content` at runtime. `settings.ts`'s `applyToDocument()` does this from
  the same `THEMES` table the swatches already use, rather than reading
  `--bg` back via `getComputedStyle` — one hand-synced source of these
  colors (already required, for the swatches) instead of two. This only
  covers the ordinary browser-tab case; an installed PWA's status bar
  reads a manifest's `theme_color` instead, which doesn't exist yet (no
  manifest — see "What's left").
- **`paginator.js` has no page-spread/parity concept, for any content
  type.** EPUB3 has a real standard for this — `rendition:page-spread-
  left/right/center`, which `epub.js` already parses into
  `section.pageSpread` — but grepping every renderer in foliate-js shows
  only `fixed-layout.js` (comics/picture books) ever reads that field;
  the reflowable renderer we use ignores it completely, even at the
  whole-spine-item level. So a chapter heading buried mid-file (no
  spine-item boundary to anchor to) has no library-level hook for "start
  on a fresh page," only the book's own TOC to fall back on: `useFoliate.ts`'s
  `markChapterStarts()` resolves every TOC entry's fragment via
  `book.resolveHref()` and sets `break-before: column` on the matching
  element when its section loads. That's a real fix for a chapter running
  on mid-page, but not for which half of a two-page spread it lands in —
  guaranteeing specifically the left page would mean measuring
  post-layout column position and conditionally inserting a blank filler
  column, reactively, on every reflow (resize, font/size/margin change) —
  a genuinely bigger feature with no library primitive to lean on
  anywhere, deliberately not built here.
- **The TOC's chapter anchor is conventionally empty and inline —
  `break-before` on it is a no-op.** Checked against a real
  multi-chapter-per-file book, not assumed: chapter markers came as
  `<p><a id="p2"></a><b>DREAMS OF DESTINY</b></p>` — an empty `<a>`
  immediately before the heading text, and `<a>` is inline by default.
  CSS Fragmentation's `break-before`/`break-after` only apply to
  block-level boxes, so the first version of `markChapterStarts()` set
  the property on that inline anchor and it silently did nothing — no
  error, chapters just kept running on, the exact class of failure this
  codebase keeps hitting with foliate-js, self-inflicted this time.
  `chapterBreakTarget()` targets the anchor's parent instead whenever the
  anchor itself has no text content (i.e., it's a bare marker, not the
  heading), which is what actually contains the heading in that markup
  pattern. Deliberately not resolved via `getComputedStyle` to check
  inline-vs-block properly: this runs inside the section iframe's `load`
  handler, before `paginator.js` makes that iframe visible again (its own
  source has a comment flagging computed-style reads as unreliable there,
  for Firefox specifically) — a purely structural check (does the anchor
  have text content?) sidesteps needing computed style at all.
- **EPUB has a real semantic vocabulary for quotes/verse/epigraphs
  (`epub:type`), but it's essentially unused in the wild.** EPUB3's
  Structural Semantics Vocabulary defines `epub:type` values like
  `epigraph`, `verse`, `dedication`; foliate-js's `footnotes.js` parses
  it (for footnote refs), but this app doesn't import that module, and
  the one real book checked for it has none of that -- nor `blockquote`,
  `<q>`, or `<cite>`. Everything in it, including the chapter titles, is
  flattened into meaningless `class="calibre1"`/`"calibre3"` markup from
  a PDF-to-HTML conversion. Any future styling keyed on `epub:type` or
  even plain `<blockquote>` will be a real, zero-cost enhancement for
  well-produced EPUBs and a complete no-op for auto-converted ones like
  this -- worth doing, but not against an unverified guess; wait for a
  real book that actually uses it.
- **Heading font choice: one face per body-font category, not per theme,
  and not the chrome font for the serif themes.** Paper/Ink/Dusk all
  have serif body fonts (Literata/Source Serif 4/Crimson Pro) but each
  needed the *same* heading face to read as a deliberate, consistent
  editorial choice rather than 3 different pairings of varying luck --
  reusing any of the 3 body fonts themselves was ruled out because it'd
  be invisible in whichever theme it's also the body font. Fraunces (new,
  self-hosted the same way as the other 4 -- latin-subset variable
  woff2 + OFL text) fills that role; Slate's sans body (Atkinson
  Hyperlegible) reuses Instrument Sans, already loaded for the chrome, so
  the sans bucket costs nothing new. `--heading-font` in `themes.css`
  follows the same "computed value read back via `getComputedStyle` in
  `theme-inject.ts`" path as `--book-font` already established.
- **`resolveHref`'s anchor return crosses the iframe realm boundary --
  `instanceof` doesn't work on it.** Same trap `interactions.ts` already
  documents for click targets: the section doc is a separate browsing
  context, so an element `anchor(doc)` resolves there is not an instance
  of this window's `HTMLElement`. `markChapterStarts()` duck-types with
  `typeof el === 'object'` instead (also ruling out the other two
  possible returns, `null` and the bare number `0` for a fragment-less
  href) -- `typeof` doesn't care which realm the object came from.
- **Highlights vanish on navigation unless redrawn by hand.** `view.js`'s
  `#createOverlayer` re-adds *search* results on a section reload
  (`create-overlay` fires after it), but never touches user annotations —
  that's on us. `useFoliate.ts` listens for `create-overlay` and calls
  `view.addAnnotation()` for every persisted highlight in the book on every
  fire; `addAnnotation` silently no-ops for a CFI whose section isn't the
  one that was just (re)created, so offering the whole list is cheap and
  correct without us tracking section indices ourselves.
- **`buildRange` (two CFIs -> one range CFI) is not exported** by
  `epubcfi.js`, confirming the plan's read of the source. Merging
  overlapping highlights instead: `annotations.ts` decides, in pure CFI
  string math (`compare`/`collapse`, both exported), which existing CFI has
  the earliest start and which has the latest end; `useAnnotations.ts` then
  resolves just those two boundary points to real DOM positions via
  `view.resolveCFI(...).anchor(doc)` and builds one merged `Range` with
  `setStart`/`setEnd`, re-deriving the final CFI via `view.getCFI()`. The
  decision logic has no DOM dependency and is Node-testable
  (`annotations.ts`'s `demo()`); the Range-building step does and isn't.
- **`view.search()`'s case-sensitivity option is `matchCase: boolean`, not a
  `sensitivity` string.** `search.js`'s exported `searchMatcher` reads
  `opts.matchCase`/`matchDiacritics`/`matchWholeWords` and derives an
  `Intl.Collator` `sensitivity` internally ('base' by default, 'case' for
  `matchCase: true` with diacritics left alone) -- it never reads a
  `sensitivity` field passed in directly. `simpleSearch`'s own fallback
  path (used only when `Intl.Segmenter` is unavailable) checks
  `sensitivity === 'variant'`, which is a different value than what
  `searchMatcher` ever actually produces for a case-sensitive query; reading
  only that inner function and assuming `{ sensitivity: 'variant' }` was
  the public option would have silently searched case-insensitively no
  matter what the toggle said. `Search.tsx` passes `matchCase` straight
  through, matching `searchMatcher`'s real signature.
- **`view.search()` already draws its own match overlay (`Overlayer.outline`)
  and `clearSearch()` already un-draws it** -- both keyed by a
  `foliate-search:`-prefixed CFI in the same annotation map real highlights
  use, but entirely separate from `useAnnotations`'s persisted ones. No
  redraw-on-navigation code was needed the way persisted highlights needed
  it (see below): search results are transient for the life of one query,
  not saved, and `clearSearch()` is called both when the query is emptied
  and when the search bar closes/unmounts.
- **A highlight's surrounding context is captured by walking `TreeWalker`
  hops across text nodes, not by assuming the boundary text node has
  enough words.** A highlight starting or ending right at an inline
  element's edge (a footnote marker, an `<em>`) has an empty remainder in
  its own text node -- `Highlights.tsx`'s context capture (in
  `useAnnotations.ts`) hops to the next/previous text node via the same
  `document.createTreeWalker` primitive foliate-js's own `text-walker.js`
  builds on, until it has enough words or a small hop cap is hit, rather
  than stopping dead at that boundary.
- **Rendering that context next to the highlighted text needs a
  punctuation check, not a hardcoded space.** A highlight's stored end
  offset routinely lands immediately before a `.`/`,` with no space in the
  source ("...circulation. Whenever..."), so unconditionally inserting a
  space before the trailing context produced "circulation . Whenever" --
  wrong, and only visible by actually reading a highlight made from real
  prose, not from the word counts alone. `Highlights.tsx` checks whether
  the context starts (or, on the leading side, ends) with punctuation
  before deciding whether a space belongs there.
- **A note's floating indicator has to be recomputed on every page turn,
  not cached from when the highlight was drawn.** This one isn't in the
  plan: a section's iframe is viewport-sized, but paginated mode pans its
  multi-column content *inside* that iframe as you turn pages within the
  same (still-loaded) section — no `create-overlay`/`load` refires, so a
  client rect captured once at draw time silently goes stale the moment the
  page turns. `computeMarkers()` in `useAnnotations.ts` re-resolves every
  note-bearing highlight's CFI to a fresh `Range`/`getClientRects()` call on
  every `relocate`, not just on section load.

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

### v1 — Phases A, B, D, E and F shipped, rest not started
- Web app manifest, for iOS lock-screen audio parity — a plain Safari tab
  still pauses on screen lock; only an installed PWA doesn't
- Mobile layout polish (single-column is automatic via CSS container
  queries; touch target sizing and layout polish are not done)

### Known Phase B gaps (deliberate, not oversights)
- No UI to remove a highlight that has no note — only note-bearing
  highlights are reachable (via their floating indicator), matching the
  plan's description of that indicator; a tap-to-remove on a plain
  highlight would need wiring up `view.js`'s `show-annotation` event, not
  built since nothing in the plan or its human-gate items calls for it yet

### v2 — not started
- Settings sync polish

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
