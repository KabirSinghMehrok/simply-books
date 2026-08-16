// v0 hardcodes Paper; v1's theme switcher passes the active theme's
// tokens through here instead of this constant.
const PAPER = { bg: '#fbfaf7', fg: '#1c1b19', accent: '#0f5c4c', bookFont: 'Literata, serif' }

/**
 * Trap #8: the paginator writes column-width, column-gap, padding,
 * overflow, height, width onto documentElement/body with !important.
 * Never touch those six here -- only color, background, font-*.
 */
export function injectTheme(doc: Document): void {
  const existing = doc.getElementById('sb-theme')
  const style = existing instanceof HTMLStyleElement ? existing : doc.createElement('style')
  style.id = 'sb-theme'
  style.textContent = `
    html, body {
      background: ${PAPER.bg} !important;
      color: ${PAPER.fg} !important;
      font-family: ${PAPER.bookFont} !important;
    }
    ::highlight(tts-spoken) {
      text-decoration: underline solid ${PAPER.accent} 2px;
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
