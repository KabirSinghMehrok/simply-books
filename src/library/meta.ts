import type { Contributorish, LangMap, Metadata } from 'foliate-js/view.js'

/**
 * Trap #3: metadata.title is a LangMap (plain string, or {[lang]: string}),
 * never render it directly -- it prints "[object Object]" for localized books.
 */
export function flatten(value: LangMap | null | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return Object.values(value)[0] ?? ''
}

/**
 * epub.js runs every metadata object through `tidy()` (epub.js:136) as the
 * last step of parsing, and tidy rewrites shapes on the way out:
 *
 *   - a one-element array collapses to the bare element
 *       [{name: 'Marcus Aurelius'}]  ->  {name: 'Marcus Aurelius'}
 *   - an object whose only key is `name` collapses to that name
 *       {name: 'Marcus Aurelius'}    ->  'Marcus Aurelius'
 *
 * So `author` is only ever a Contributor[] for a book with two or more
 * dc:creator entries. The overwhelmingly common single-author book yields a
 * bare string, and calling .map on it throws. Same for publisher/language.
 */
function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

/** One contributor, at any of the three collapse depths tidy() can leave it. */
function contributorName(c: Contributorish): string {
  if (typeof c !== 'object' || c === null) return flatten(c)
  // A tidied contributor keeps a `name` key only when it carried more than a
  // name (a role, a file-as); otherwise it *is* the name -- a LangMap already.
  return 'name' in c ? flatten(c.name) : flatten(c)
}

/**
 * Trap #3: metadata.author is absent entirely when the EPUB has no
 * dc:creator, and -- per toArray above -- is usually not an array.
 */
export function authors(metadata: Metadata): string {
  return toArray(metadata.author).map(contributorName).filter(Boolean).join(', ')
}

function demo() {
  console.assert(flatten('X') === 'X', 'flatten: plain string passes through')
  console.assert(flatten({ en: 'X' }) === 'X', 'flatten: language map takes first value')
  console.assert(flatten(undefined) === '', 'flatten: missing value is empty string')
  console.assert(flatten(null) === '', 'flatten: null is empty string')

  console.assert(authors({}) === '', 'authors: absent dc:creator is empty string')

  // The three shapes tidy() actually produces, shallowest first. The first of
  // these is what a single-dc:creator EPUB gives, and what threw in v0.
  console.assert(
    authors({ author: 'Marcus Aurelius' }) === 'Marcus Aurelius',
    'authors: lone contributor tidied all the way down to a bare string',
  )
  console.assert(
    authors({ author: { en: 'Marcus Aurelius' } }) === 'Marcus Aurelius',
    'authors: lone contributor tidied to a bare language map',
  )
  console.assert(
    authors({ author: { name: 'Marcus Aurelius', role: ['aut'] } }) === 'Marcus Aurelius',
    'authors: lone contributor kept as an object because it carries a role',
  )
  console.assert(
    authors({ author: [{ name: { en: 'A' } }, 'B'] }) === 'A, B',
    'authors: multiple contributors stay an array, of mixed depth',
  )
  console.assert(
    authors({ author: [{ name: 'A' }, ''] }) === 'A',
    'authors: an empty contributor name is dropped, not joined as ", "',
  )
  console.log('meta.ts: all checks passed')
}

// Vite always defines import.meta.env; plain `node --experimental-strip-types`
// does not -- so this runs the self-check under the latter and not the former.
if (import.meta.env === undefined) demo()
