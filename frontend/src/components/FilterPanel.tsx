import { useState, useEffect } from 'react'
import { Filter, Save, X, RotateCcw, BookmarkPlus } from 'lucide-react'
import { metaApi } from '../lib/api'
import type { CommitFilter, FilterPreset } from '../types'

interface Props {
  repoId: number
  filter: CommitFilter
  onChange: (f: CommitFilter) => void
}

export function FilterPanel({ repoId, filter, onChange }: Props) {
  const [authors, setAuthors]   = useState<string[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [presets, setPresets]   = useState<FilterPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)

  useEffect(() => {
    if (!repoId) return
    metaApi.authors(repoId).then(d => setAuthors(Array.isArray(d) ? d : [])).catch(() => setAuthors([]))
    metaApi.branches(repoId).then(d => setBranches(Array.isArray(d) ? d : [])).catch(() => setBranches([]))
    metaApi.presets(repoId).then(d => setPresets(Array.isArray(d) ? d : [])).catch(() => setPresets([]))
  }, [repoId])

  const set = (patch: Partial<CommitFilter>) => onChange({ ...filter, ...patch })
  const reset = () => onChange({})
  const hasActive = Object.values(filter).some(v => v !== undefined && v !== '')

  const savePreset = async () => {
    if (!presetName.trim()) return
    try {
      const saved = await metaApi.savePreset(repoId, presetName.trim(), filter)
      setPresets(p => [saved, ...p])
      setPresetName('')
      setSavingPreset(false)
    } catch { /* ignore */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '11px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)' }}>
          <Filter size={12} /> Filters
          {hasActive && <span className="badge badge-cyan" style={{ fontSize: 9 }}>ON</span>}
        </div>
        {hasActive && (
          <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={reset}>
            <RotateCcw size={11} /> Reset
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        {/* Author */}
        <Field label="Author">
          <select className="select" style={{ width: '100%' }} value={filter.author || ''} onChange={e => set({ author: e.target.value || undefined })}>
            <option value="">All authors</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>

        {/* Branch */}
        <Field label="Branch">
          <select className="select" style={{ width: '100%' }} value={filter.branch || ''} onChange={e => set({ branch: e.target.value || undefined })}>
            <option value="">All branches</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>

        {/* File path */}
        <Field label="File path">
          <input className="input" placeholder="e.g. src/auth/" value={filter.file || ''} onChange={e => set({ file: e.target.value || undefined })} />
        </Field>

        {/* Date from */}
        <Field label="Date from">
          <input className="input" type="date" value={filter.date_from?.split('T')[0] || ''} onChange={e => set({ date_from: e.target.value ? e.target.value + 'T00:00:00Z' : undefined })} />
        </Field>

        {/* Date to */}
        <Field label="Date to">
          <input className="input" type="date" value={filter.date_to?.split('T')[0] || ''} onChange={e => set({ date_to: e.target.value ? e.target.value + 'T23:59:59Z' : undefined })} />
        </Field>

        {/* Limit */}
        <Field label={`Limit: ${filter.limit || 100}`}>
          <input type="range" min={10} max={500} step={10} value={filter.limit || 100}
            onChange={e => set({ limit: Number(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--accent)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--txt-3)' }}>
            <span>10</span><span>500</span>
          </div>
        </Field>

        {/* Saved presets */}
        {presets.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 6 }}>Saved presets</div>
            {presets.map(p => (
              <button key={p.id} onClick={() => onChange(p.filters as CommitFilter)} style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px',
                marginBottom: 4, borderRadius: 4, border: '1px solid var(--border)',
                background: 'none', cursor: 'pointer', color: 'var(--txt-2)', fontSize: 12, fontFamily: 'var(--font-ui)'
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <BookmarkPlus size={11} color="var(--accent-2)" /> {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Save preset */}
        {hasActive && !savingPreset && (
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }} onClick={() => setSavingPreset(true)}>
            <Save size={11} /> Save as preset
          </button>
        )}
        {savingPreset && (
          <div style={{ display: 'flex', gap: 5 }}>
            <input className="input" style={{ flex: 1, fontSize: 12 }} placeholder="Preset name…" value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') savePreset() }} />
            <button className="btn btn-primary" style={{ padding: '6px 10px' }} onClick={savePreset}><Save size={12} /></button>
            <button className="btn btn-ghost" style={{ padding: '6px 9px' }} onClick={() => setSavingPreset(false)}><X size={12} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}
