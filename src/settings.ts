import { useEffect, useRef, useState } from 'react'
import { getSettings, putSettings, type FontFamily, type SettingsRecord, type ThemeId } from './library/db'

// Preview colors for the theme swatches -- kept in sync by hand with the
// :root / [data-theme] blocks in themes.css. The active theme's real
// colors reach the page (and the book) through those CSS custom
// properties; this list exists only so the settings panel can render a
// swatch for a theme that isn't the active one.
export const THEMES: { id: ThemeId; name: string; bg: string; fg: string; stack: string }[] = [
  { id: 'paper', name: 'Paper', bg: '#fbfaf7', fg: '#1c1b19', stack: "'Literata', serif" },
  { id: 'ink', name: 'Ink', bg: '#121316', fg: '#e4e2dd', stack: "'Source Serif 4', serif" },
  { id: 'dusk', name: 'Dusk', bg: '#1e1b18', fg: '#d8cfc2', stack: "'Crimson Pro', serif" },
  { id: 'slate', name: 'Slate', bg: '#edeef0', fg: '#22262b', stack: "'Atkinson Hyperlegible', sans-serif" },
]

export const FONTS: { id: Exclude<FontFamily, 'theme'>; name: string; stack: string }[] = [
  { id: 'literata', name: 'Literata', stack: "'Literata', serif" },
  { id: 'source-serif', name: 'Source Serif 4', stack: "'Source Serif 4', serif" },
  { id: 'crimson-pro', name: 'Crimson Pro', stack: "'Crimson Pro', serif" },
  { id: 'atkinson', name: 'Atkinson Hyperlegible', stack: "'Atkinson Hyperlegible', sans-serif" },
]

function applyToDocument(settings: SettingsRecord): void {
  const root = document.documentElement
  root.dataset.theme = settings.themeId
  root.style.setProperty('--font-scale', String(settings.fontScale))
  root.style.setProperty('--line-height', String(settings.lineHeight))
  const font = FONTS.find(f => f.id === settings.fontFamily)
  if (font) root.style.setProperty('--book-font', font.stack)
  else root.style.removeProperty('--book-font') // 'theme' -- fall back to the [data-theme] rule

  // Matches the browser's own chrome (Chrome's address bar, and on Android,
  // the on-screen system nav bar) to the active theme. Reused from THEMES
  // rather than read back via getComputedStyle -- both already have to stay
  // in sync with themes.css by hand, so there's no reason to add a second
  // way of getting the same color.
  const theme = THEMES.find(t => t.id === settings.themeId)
  if (theme) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg)
}

/**
 * Loads settings once, applies the appearance ones (theme, font override,
 * scale, line height) to `<html>` as CSS custom properties, and persists
 * patches back to IndexedDB. The book's iframe doesn't inherit these --
 * it's a separate Document -- so `theme-inject.ts` re-reads the resolved
 * values via `getComputedStyle` instead of this hook pushing them there
 * directly.
 *
 * `applyToDocument` runs synchronously in `update()` itself, NOT in a
 * `useEffect` keyed on `settings`. This hook lives in App, an ancestor of
 * the reader's `useFoliate`, whose own effect re-runs `injectTheme` off
 * the same `settings` change -- and React fires child effects before
 * parent effects within one commit. An effect here would still be racing
 * that child effect and losing: `injectTheme` would read the *previous*
 * theme's computed style, one click behind, every time. Writing here
 * synchronously (before the state update that triggers either effect)
 * means the custom properties are already correct by the time anything
 * downstream reads them.
 */
export function useSettings() {
  const [settings, setSettings] = useState<SettingsRecord | null>(null)
  const ref = useRef<SettingsRecord | null>(null)

  useEffect(() => {
    void getSettings().then(s => {
      ref.current = s
      applyToDocument(s)
      setSettings(s)
    })
  }, [])

  function update(patch: Partial<SettingsRecord>) {
    if (!ref.current) return
    const next = { ...ref.current, ...patch }
    ref.current = next
    applyToDocument(next)
    setSettings(next)
    void putSettings(next)
  }

  return { settings, update }
}
