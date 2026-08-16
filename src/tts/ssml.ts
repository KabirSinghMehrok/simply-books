export type Chunk = { mark: string | null; text: string }

const TAG_RE = /<[^>]+>/g
const MARK_RE = /^<mark\s+name="([^"]*)"\s*\/>$/

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&') // must run last, or a literal "&amp;lt;" double-decodes
}

/**
 * foliate-js's tts.js serializes one SSML `<speak>` document per block via
 * XMLSerializer. Its own fragmentToSSML only ever emits `speak`, `lang`,
 * `emphasis`, `phoneme`, `mark` and `break` -- every other source element
 * (spans, anchors, whatever the book's markup used) is unwrapped and its
 * children spliced straight into the parent, so a full XML parser buys
 * nothing here; DOMParser also isn't available under plain Node, and this
 * file's self-check runs there. A tokenizer over that fixed tag set is
 * both simpler and environment-independent.
 */
export function parseSSML(ssml: string): Chunk[] {
  const chunks: Chunk[] = [{ mark: null, text: '' }]
  let lastIndex = 0

  for (const match of ssml.matchAll(TAG_RE)) {
    const index = match.index ?? 0
    const text = ssml.slice(lastIndex, index)
    if (text) chunks[chunks.length - 1].text += decodeEntities(text)
    lastIndex = index + match[0].length

    const tag = match[0]
    const mark = MARK_RE.exec(tag)
    if (mark) chunks.push({ mark: mark[1], text: '' })
    else if (tag.startsWith('<break')) chunks[chunks.length - 1].text += ' '
    // Any other tag (speak, lang, emphasis, phoneme, open or close) carries
    // no text of its own and doesn't start a new chunk -- skip it.
  }
  const rest = ssml.slice(lastIndex)
  if (rest) chunks[chunks.length - 1].text += decodeEntities(rest)

  return chunks
    .map(c => ({ mark: c.mark, text: c.text.replace(/\s+/g, ' ').trim() }))
    .filter(c => c.text.length > 0)
}

function demo() {
  const marked = parseSSML(
    '<speak xmlns="http://www.w3.org/2001/10/synthesis">' +
      '<mark name="0"/>Hello <emphasis>world</emphasis>.' +
      '<mark name="1"/> Bye<break/>now &amp; then.</speak>',
  )
  console.assert(marked.length === 2, 'two marked chunks survive')
  console.assert(
    marked[0].mark === '0' && marked[0].text === 'Hello world.',
    'text is assembled across a nested element, mark preserved',
  )
  console.assert(
    marked[1].mark === '1' && marked[1].text === 'Bye now & then.',
    'break becomes a space and entities decode, in document order',
  )

  const leading = parseSSML('<speak>Intro <mark name="0"/>Hello.</speak>')
  console.assert(leading.length === 2, 'leading unmarked text is its own chunk')
  console.assert(
    leading[0].mark === null && leading[0].text === 'Intro',
    'text before the first mark has a null mark, not a dropped one',
  )

  const blanks = parseSSML('<speak><mark name="0"/>   <mark name="1"/>Hi.</speak>')
  console.assert(blanks.length === 1, 'whitespace-only chunk between two marks is dropped')
  console.assert(
    blanks[0].mark === '1' && blanks[0].text === 'Hi.',
    'the surviving chunk keeps its own mark, not the dropped one\'s',
  )

  console.log('ssml.ts: all checks passed')
}

// Vite always defines import.meta.env; plain `node --experimental-strip-types`
// does not -- so this runs the self-check under the latter and not the former.
if (import.meta.env === undefined) demo()
