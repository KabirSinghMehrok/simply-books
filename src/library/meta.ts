import type { Contributor, LangMap, Metadata } from 'foliate-js/view.js'

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
 * Trap #3: metadata.author is a Contributor[], and the key is absent
 * entirely when the EPUB has no dc:creator.
 */
export function authors(metadata: Metadata): string {
  return (metadata.author ?? [])
    .map((a: Contributor) => flatten(a.name))
    .filter(Boolean)
    .join(', ')
}

function demo() {
  console.assert(flatten('X') === 'X', 'flatten: plain string passes through')
  console.assert(flatten({ en: 'X' }) === 'X', 'flatten: language map takes first value')
  console.assert(flatten(undefined) === '', 'flatten: missing value is empty string')
  console.assert(flatten(null) === '', 'flatten: null is empty string')
  console.assert(authors({}) === '', 'authors: absent dc:creator is empty string')
  console.assert(
    authors({ author: [{ name: 'Marcus Aurelius' }] }) === 'Marcus Aurelius',
    'authors: single plain-string contributor',
  )
  console.assert(
    authors({ author: [{ name: { en: 'A' } }, { name: 'B' }] }) === 'A, B',
    'authors: joins multiple contributors, language map and plain string alike',
  )
  console.log('meta.ts: all checks passed')
}

// Vite always defines import.meta.env; plain `node --experimental-strip-types`
// does not -- so this runs the self-check under the latter and not the former.
if (import.meta.env === undefined) demo()
