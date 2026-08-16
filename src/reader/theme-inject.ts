/**
 * Trap #8: the paginator writes column-width, column-gap, padding,
 * overflow, height, width onto documentElement/body with !important.
 * Never touch those six here -- only color, background, font-*
 * (and line-height, which the paginator never sets either).
 */
/*
 * The svg[viewBox] rule below: cover and frontmatter pages usually wrap their
 * image in an <svg width="100%" height="100%" viewBox="..."> rather than an
 * <img>. The paginator forces max-height, max-width and object-fit onto every
 * img+svg (paginator.js:333), but object-fit does nothing to an inline svg --
 * it only applies to replaced content -- so width:100% stretched the box
 * across the whole column while max-height clamped its height, giving a badly
 * distorted frontispiece. Those three properties are set inline with
 * !important and cannot be overridden from a stylesheet, but the paginator
 * never writes the width property, so this rule wins. Restricted to [viewBox]
 * because that is exactly the case with an intrinsic ratio to fall back on.
 *
 * Keep prose like this OUT of the template literal below -- a stray backtick
 * inside it silently terminates the string.
 */
/**
 * The book's iframe is a separate Document -- it doesn't inherit the outer
 * page's CSS custom properties -- so the active theme/font/scale reach it
 * only by re-reading the *resolved* values off the outer root (which
 * `useSettings` keeps current via `data-theme` + inline custom-property
 * overrides) and writing them into this doc as plain values. Must be
 * re-run against every loaded section doc whenever settings change --
 * see useFoliate.ts / Reader.tsx.
 */
export function injectTheme(doc: Document): void {
  const root = getComputedStyle(document.documentElement)
  const bg = root.getPropertyValue('--bg').trim()
  const fg = root.getPropertyValue('--fg').trim()
  const accent = root.getPropertyValue('--accent').trim()
  const bookFont = root.getPropertyValue('--book-font').trim()
  const fontScale = parseFloat(root.getPropertyValue('--font-scale')) || 1
  const lineHeight = root.getPropertyValue('--line-height').trim() || '1.6'

  const existing = doc.getElementById('sb-theme')
  const style = existing instanceof HTMLStyleElement ? existing : doc.createElement('style')
  style.id = 'sb-theme'
  style.textContent = `
    html {
      font-size: ${fontScale * 100}% !important;
    }
    html, body {
      background: ${bg} !important;
      color: ${fg} !important;
      font-family: ${bookFont} !important;
      line-height: ${lineHeight} !important;
    }
    svg[viewBox] { width: auto; }
    ::highlight(tts-spoken) {
      text-decoration: underline solid ${accent} 2px;
      text-underline-offset: 3px;
    }
  `
  doc.head.append(style)
}

/**
 * Underlines the sentence currently being spoken via the CSS Custom
 * Highlight API -- no DOM mutation, so it can't disturb the live block
 * walk `view.tts` does over this same document.
 */
export function highlightSpokenRange(range: Range): void {
  const win = range.startContainer.ownerDocument?.defaultView
  if (!win) return
  win.CSS.highlights.set('tts-spoken', new win.Highlight(range))
}
