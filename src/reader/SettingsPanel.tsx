import type { FoliateView } from 'foliate-js/view.js'
import type { SettingsRecord, TtsEngine } from '../library/db'
import type { useTtsDriver } from '../tts/driver'
import { PIPER_DOWNLOAD_MB } from '../tts/piper-engine'
import { FONTS, THEMES } from '../settings'
import { applyLayout } from './useFoliate'
import './SettingsPanel.css'

const SCALES = [0.85, 1, 1.15, 1.3, 1.5]
const LINE_HEIGHTS = [1.3, 1.6, 1.9, 2.2]
const RATES = [0.75, 1, 1.25, 1.5, 2]

interface SettingsPanelProps {
  view: FoliateView
  tts: ReturnType<typeof useTtsDriver>
  settings: SettingsRecord
  onUpdate: (patch: Partial<SettingsRecord>) => void
}

export function SettingsPanel({ view, tts, settings, onUpdate }: SettingsPanelProps) {
  function setLayout(flow: SettingsRecord['flow'], columns: 1 | 2) {
    applyLayout(view, flow, columns)
    onUpdate({ flow, columns })
  }

  return (
    <div id="settings-panel" className="settings-panel" popover="auto">
      <section className="settings-panel__group">
        <h3>Appearance</h3>
        <div className="settings-panel__swatches">
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`settings-panel__swatch${
                settings.themeId === t.id ? ' settings-panel__swatch--active' : ''
              }`}
              style={{ background: t.bg, color: t.fg }}
              onClick={() => onUpdate({ themeId: t.id })}
              aria-label={t.name}
              aria-pressed={settings.themeId === t.id}
            >
              Aa
            </button>
          ))}
        </div>

        <label className="settings-panel__row">
          Font
          <select
            value={settings.fontFamily}
            onChange={e => onUpdate({ fontFamily: e.target.value as SettingsRecord['fontFamily'] })}
          >
            <option value="theme">Theme default</option>
            {FONTS.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-panel__row">
          Size
          <select value={settings.fontScale} onChange={e => onUpdate({ fontScale: Number(e.target.value) })}>
            {SCALES.map(s => (
              <option key={s} value={s}>
                {Math.round(s * 100)}%
              </option>
            ))}
          </select>
        </label>

        <label className="settings-panel__row">
          Line height
          <select value={settings.lineHeight} onChange={e => onUpdate({ lineHeight: Number(e.target.value) })}>
            {LINE_HEIGHTS.map(l => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="settings-panel__group">
        <h3>Layout</h3>
        <div className="settings-panel__segmented">
          {(
            [
              { label: 'Single page', active: settings.flow === 'paginated' && settings.columns === 1, onClick: () => setLayout('paginated', 1) },
              { label: 'Two page', active: settings.flow === 'paginated' && settings.columns === 2, onClick: () => setLayout('paginated', 2) },
              { label: 'Scrolled', active: settings.flow === 'scrolled', onClick: () => setLayout('scrolled', settings.columns) },
            ] as const
          ).map(opt => (
            <button
              key={opt.label}
              className={`settings-panel__segment${opt.active ? ' settings-panel__segment--active' : ''}`}
              aria-pressed={opt.active}
              onClick={opt.onClick}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-panel__group">
        <h3>Voice</h3>
        <div className="settings-panel__segmented">
          {(
            [
              { id: 'system' as const, label: 'System' },
              { id: 'natural' as const, label: 'Natural' },
            ] satisfies { id: TtsEngine; label: string }[]
          ).map(opt => (
            <button
              key={opt.id}
              className={`settings-panel__segment${tts.engine === opt.id ? ' settings-panel__segment--active' : ''}`}
              aria-pressed={tts.engine === opt.id}
              onClick={() => tts.setEngine(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {tts.engine === 'natural' && tts.piperDownload.status !== 'ready' && (
          <div className="settings-panel__row settings-panel__piper">
            {tts.piperDownload.status === 'downloading' ? (
              <>
                <progress value={tts.piperDownload.loaded} max={tts.piperDownload.total || undefined} />
                <span>Downloading voice…</span>
              </>
            ) : tts.piperDownload.status === 'error' ? (
              <>
                <span>Download failed: {tts.piperDownload.message}</span>
                <button onClick={tts.downloadPiperVoice}>Retry</button>
              </>
            ) : (
              <button onClick={tts.downloadPiperVoice}>Download voice (~{PIPER_DOWNLOAD_MB} MB)</button>
            )}
          </div>
        )}

        <label className="settings-panel__row">
          Rate
          <select value={tts.rate} onChange={e => tts.setRate(Number(e.target.value))}>
            {RATES.map(r => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>

        {tts.voices.length > 0 && (tts.engine !== 'natural' || tts.piperDownload.status === 'ready') && (
          <label className="settings-panel__row">
            Voice
            <select
              value={tts.voice?.voiceId ?? ''}
              onChange={e => {
                const next = tts.voices.find(v => v.voiceId === e.target.value)
                if (next) tts.setVoice(next)
              }}
            >
              {tts.voices.map(v => (
                <option key={v.voiceId} value={v.voiceId}>
                  {v.name}
                  {v.localService ? '' : ' (online)'}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
    </div>
  )
}
