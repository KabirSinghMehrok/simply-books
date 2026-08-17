# CLAUDE.md

Simply Book: a free, fully client-side EPUB reader with TTS. No backend, no
accounts. React + Vite + TS + foliate-js + Web Speech API + Piper (opt-in
natural voice) + IndexedDB.

## Keep docs in sync

**Every feature change updates README.md and ROADMAP.md in the same commit.**
- README.md: the feature list and stack table.
- ROADMAP.md: move the item from "What's left" to "Status," and add a
  "Technical decisions" or "Architecture notes" entry if the change involved
  a real tradeoff or a non-obvious gotcha (not for routine bug fixes).
Don't let these drift — ROADMAP.md's value is entirely in staying current.

## Commands

```bash
npm run dev                                        # dev server
npx tsc -b --force                                  # type-check (do this before claiming done)
npm run build                                       # build + bundle size (watch the main chunk, budget ~250KB gz)
node --experimental-strip-types src/tts/ssml.ts     # ssml.ts self-check
node --experimental-strip-types src/library/meta.ts # meta.ts self-check
```
No test framework. Non-trivial logic gets an inline `assert`-based `demo()`
guarded by `if (import.meta.env === undefined) demo()` (runs under plain
Node, not under Vite) — see ssml.ts / meta.ts for the pattern.

## Hard rules

- Never mention Claude/Anthropic in a git commit message. No Co-Authored-By.
- Don't add a dependency, abstraction, or config knob before it's needed.
  Plain CSS, no state library, no component library, no test framework.
- Passing `tsc` is not passing. foliate-js has no real types (see below) —
  every trap in this codebase is a *silent* failure the compiler will
  happily agree with. Test in an actual browser with a real EPUB before
  calling a reader/TTS change done.

## foliate-js: treat its docs and its own types as untrustworthy

foliate-js ships no TypeScript types (`src/types/foliate-view.d.ts` is
hand-written from source) and its own README shows API that doesn't work.
Verify against `node_modules/foliate-js/*.js` source, not memory or docs.

- **Layout attributes go on `view.renderer`, not `view`.**
  `view.setAttribute('flow', ...)` — what the README shows — is a silent
  no-op.
- **Renderer layout attribute *values* need real CSS units.** The
  paginator's shadow stylesheet computes `grid-template-columns`/`-rows`
  via `calc()` against the custom properties these attributes feed —
  `setAttribute('max-inline-size', '720')` (no `px`) makes that `calc()`
  invalid, silently voiding the whole grid. `parseFloat('720')` is still
  `720`, so the JS-side layout math stays correct and nothing throws — the
  book just renders in an auto-sized implicit row. Always pass units:
  `'720px'`, `'7%'`, `` `${n}px` ``.
- **Metadata shapes collapse.** `epub.js`'s `tidy()` step turns a
  single-item array into its bare element, and an object whose only key is
  `name` into that name. `metadata.author` is a `Contributor[]` only for
  2+ authors — the common single-author book gave a bare string and broke
  `.map()` at runtime with `tsc` passing clean the whole time. Always read
  metadata through `src/library/meta.ts`'s `flatten()`/`authors()`, never
  the raw field.
- **The page follows the TTS voice via `scrollToAnchor` inside the
  `initTTS` highlight callback**, not `view.next()`. One code path for
  paginated and scrolled.
- **`view.next()` resolving doesn't mean TTS is ready for the new
  section** — the `load` listener's `initTTS` call is fire-and-forget.
  Use `useFoliate.ts`'s exported `ensureTts()` (idempotent, awaits the
  real setup) instead of assuming `view.tts` is current.
- **The book's iframe is same-origin but a separate browsing context** —
  clicks/keys/mousemove inside it don't bubble to the parent window.
  `src/reader/interactions.ts` is attached once to the outer `window` and
  once per section doc (via `load`), on purpose. Swipe needs no handling —
  foliate-js's own paginator already attaches touch listeners per doc.
- **A subpath ambient `declare module` doesn't work under `bundler`/
  `node16` moduleResolution** if the specifier resolves to a real
  (untyped) file — TS uses the real file's implicit `any` instead of the
  declaration. Fixed via a `paths` redirect in tsconfig, not a `declare
  module` block — see `src/types/foliate-view.d.ts`'s header comment.

## Web Speech: the two ways it silently breaks

- **`speechSynthesis.cancel()` fires the outgoing utterance's `onend`
  synchronously.** Every utterance callback in `src/tts/driver.ts` is
  guarded by a generation counter (`gen`), or skipping a sentence
  double-advances the queue. No error, just an occasionally dropped
  sentence — re-check by hand after touching `speakFrom`.
- **iOS requires the first `speak()` inside a synchronous user gesture.**
  TTS is pre-warmed on the `load` event, never awaited inside the play
  button's click handler. Works fine on desktop either way — only breaks,
  silently, on iPhone.

## Module ownership (don't reach around these)

- `src/library/db.ts` — the only module touching IndexedDB.
- `src/reader/useFoliate.ts` — owns the `<foliate-view>` element's
  lifecycle and exports `ensureTts()`; `src/tts/driver.ts` is the other
  place allowed to call into `view.tts`/`view.renderer` directly.
- `src/library/meta.ts` — the only place that reads `metadata.title` /
  `metadata.author` directly. Everything else gets flattened strings.
