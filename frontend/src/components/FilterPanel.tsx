import { useState, useEffect, useId, useRef } from 'react'
import { Filter, Save, X, RotateCcw, BookmarkPlus, Calendar, ChevronDown } from 'lucide-react'
import { metaApi } from '../lib/api'
import type { CommitFilter, FilterPreset } from '../types'

interface Props {
  repoId: number
  filter: CommitFilter
  onChange: (f: CommitFilter) => void
}

// ── Format helpers ────────────────────────────────────────────────────────────

// yyyy/mm/dd string → ISO timestamp string for the API
function toISO(display: string, endOfDay = false): string | undefined {
  const clean = display.trim().replace(/\//g, '-')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return undefined
  return clean + (endOfDay ? 'T23:59:59Z' : 'T00:00:00Z')
}

// ISO timestamp → yyyy/mm/dd display string
function toDisplay(iso: string | undefined): string {
  if (!iso) return ''
  return iso.split('T')[0].replace(/-/g, '/')
}

// Check a typed string is valid yyyy/mm/dd (or empty)
function isValid(s: string): boolean {
  if (!s.trim()) return true
  return /^\d{4}\/\d{2}\/\d{2}$/.test(s.trim())
}

// JS Date → yyyy/mm/dd
function dateToDisplay(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('/')
}

// ── DateInput ─────────────────────────────────────────────────────────────────
// Fully controlled: `committed` is the authoritative display value from the parent.
// `draft` holds what the user is currently typing. On blur / Enter / datalist
// pick, draft is validated and committed up to parent.
interface DateInputProps {
  inputId: string
  listId: string
  committed: string          // canonical yyyy/mm/dd from parent (can be '')
  placeholder: string
  allDates: string[]
  endOfDay?: boolean
  onCommit: (iso: string | undefined) => void
}

function DateInput({ inputId, listId, committed, placeholder, allDates, endOfDay = false, onCommit }: DateInputProps) {
  const [draft, setDraft] = useState(committed)
  const prevCommitted = useRef(committed)

  // When the parent pushes a new committed value (e.g. "All" button, reset),
  // overwrite draft immediately — but only if the value actually changed.
  useEffect(() => {
    if (committed !== prevCommitted.current) {
      setDraft(committed)
      prevCommitted.current = committed
    }
  })

  const flush = (val: string) => {
    const v = val.trim()
    if (!v) {
      onCommit(undefined)
    } else if (isValid(v)) {
      onCommit(toISO(v, endOfDay))
    }
    // if invalid — leave draft as-is, don't propagate
  }

  const invalid = draft.length > 0 && !isValid(draft)

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          id={inputId}
          list={listId}
          className="input"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            paddingRight: 26,
            borderColor: invalid ? 'var(--danger)' : undefined,
          }}
          placeholder={placeholder}
          value={draft}
          onChange={e => {
            const v = e.target.value
            setDraft(v)
            // Fire immediately when valid or cleared
            if (!v.trim() || isValid(v)) flush(v)
          }}
          onBlur={e => flush(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') flush((e.target as HTMLInputElement).value) }}
        />

        <datalist id={listId}>
          {allDates.map(d => <option key={d} value={d} />)}
        </datalist>

        {allDates.length > 0 && (
          <ChevronDown size={11} color="var(--txt-3)"
            style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
        )}
      </div>

      {invalid && (
        <div style={{ fontSize: 9, color: 'var(--danger)', marginTop: 2 }}>Expected yyyy/mm/dd</div>
      )}
    </div>
  )
}

// ── FilterPanel ───────────────────────────────────────────────────────────────
export function FilterPanel({ repoId, filter, onChange }: Props) {
  const uid = useId().replace(/:/g, '')

  const [authors,      setAuthors]      = useState<string[]>([])
  const [branches,     setBranches]     = useState<string[]>([])
  const [allDates,     setAllDates]     = useState<string[]>([])
  const [rangeFrom,    setRangeFrom]    = useState('')   // earliest commit yyyy/mm/dd
  const [rangeTo,      setRangeTo]      = useState('')   // latest  commit yyyy/mm/dd
  const [presets,      setPresets]      = useState<FilterPreset[]>([])
  const [presetName,   setPresetName]   = useState('')
  const [savingPreset, setSavingPreset] = useState(false)

  // Derive display strings directly from filter — single source of truth
  const fromDisplay = toDisplay(filter.date_from)
  const toDisplay_  = toDisplay(filter.date_to)

  useEffect(() => {
    if (!repoId) return

    metaApi.authors(repoId).then(d => setAuthors(Array.isArray(d) ? d : [])).catch(() => {})
    metaApi.branches(repoId).then(d => setBranches(Array.isArray(d) ? d : [])).catch(() => {})
    metaApi.presets(repoId).then(d => setPresets(Array.isArray(d) ? d : [])).catch(() => {})
    metaApi.distinctDates(repoId).then(d => setAllDates(Array.isArray(d) ? d : [])).catch(() => {})

    metaApi.dateRange(repoId)
      .then(r => {
        setRangeFrom(r.from)
        setRangeTo(r.to)
        // Always seed full range when repo loads
        onChange({
          ...filter,
          date_from: toISO(r.from, false),
          date_to:   toISO(r.to,   true),
        })
      })
      .catch(() => {})
  }, [repoId])

  const set = (patch: Partial<CommitFilter>) => onChange({ ...filter, ...patch })

  const applyQuickRange = (days: number) => {
    if (days === 0) {
      // Full repo range
      onChange({
        ...filter,
        date_from: toISO(rangeFrom, false),
        date_to:   toISO(rangeTo,   true),
      })
    } else {
      const to   = new Date()
      const from = new Date()
      from.setDate(from.getDate() - days)
      onChange({
        ...filter,
        date_from: toISO(dateToDisplay(from), false),
        date_to:   toISO(dateToDisplay(to),   true),
      })
    }
  }

  const reset = () => onChange({
    date_from: rangeFrom ? toISO(rangeFrom, false) : undefined,
    date_to:   rangeTo   ? toISO(rangeTo,   true)  : undefined,
  })

  const isFullRange =
    rangeFrom && rangeTo &&
    fromDisplay === rangeFrom &&
    toDisplay_  === rangeTo

  const savePreset = async () => {
    if (!presetName.trim()) return
    try {
      const saved = await metaApi.savePreset(repoId, presetName.trim(), filter)
      setPresets(p => [saved, ...p])
      setPresetName('')
      setSavingPreset(false)
    } catch { /* ignore */ }
  }

  const hasNonDateFilter = !!(filter.author || filter.branch || filter.file)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '11px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)' }}>
          <Filter size={12} /> Filters
          {hasNonDateFilter && <span className="badge badge-cyan" style={{ fontSize: 9 }}>ON</span>}
        </div>
        <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={reset} title="Reset to full date range">
          <RotateCcw size={11} /> Reset
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>

        {/* Author */}
        <Field label="Author">
          <select className="select" style={{ width: '100%' }}
            value={filter.author || ''} onChange={e => set({ author: e.target.value || undefined })}>
            <option value="">All authors</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>

        {/* Branch */}
        <Field label="Branch">
          <select className="select" style={{ width: '100%' }}
            value={filter.branch || ''} onChange={e => set({ branch: e.target.value || undefined })}>
            <option value="">All branches</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>

        {/* File path */}
        <Field label="File path">
          <input className="input" placeholder="e.g. src/auth/"
            value={filter.file || ''} onChange={e => set({ file: e.target.value || undefined })} />
        </Field>

        {/* Date range */}
        <Field label={
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Calendar size={10} />
            <span>Date range</span>
            {allDates.length > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--txt-3)', fontSize: 9 }}>
                ({allDates.length} active days)
              </span>
            )}
          </div>
        }>

          {/* Quick-range chips */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>

            {/* "All" chip — full width, shows the actual span */}
            <button
              onClick={() => applyQuickRange(0)}
              title="Show full commit history"
              style={{
                width: '100%', textAlign: 'left', padding: '5px 10px',
                background: isFullRange ? 'rgba(110,231,255,0.1)' : 'var(--bg-3)',
                border: `1px solid ${isFullRange ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 4, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: isFullRange ? 'var(--accent)' : 'var(--txt-2)',
                fontWeight: isFullRange ? 700 : 400,
                transition: 'all 0.12s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.color = 'var(--accent)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = isFullRange ? 'var(--accent)' : 'var(--border)'
                e.currentTarget.style.color = isFullRange ? 'var(--accent)' : 'var(--txt-2)'
              }}
            >
              <span style={{ opacity: 0.6, fontSize: 13 }}>⟷</span>
              {rangeFrom && rangeTo
                ? <span>{rangeFrom}<span style={{ opacity: 0.5, margin: '0 6px' }}>→</span>{rangeTo}</span>
                : <span style={{ color: 'var(--txt-3)', fontFamily: 'var(--font-ui)', fontSize: 10 }}>All (loading…)</span>
              }
              {isFullRange && (
                <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.7 }}>✓ active</span>
              )}
            </button>

            {/* Relative chips */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ label: 'Last 7d', days: 7 }, { label: 'Last 30d', days: 30 }, { label: 'Last 90d', days: 90 }].map(({ label, days }) => (
                <button key={days} onClick={() => applyQuickRange(days)} style={{
                  flex: 1, padding: '3px 0', fontSize: 10,
                  background: 'var(--bg-3)', border: '1px solid var(--border)',
                  borderRadius: 4, cursor: 'pointer',
                  fontFamily: 'var(--font-ui)', color: 'var(--txt-3)',
                  transition: 'all 0.1s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--txt-3)' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* From */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
              From
            </div>
            <DateInput
              inputId={`${uid}-from`}
              listId={`${uid}-from-list`}
              committed={fromDisplay}
              placeholder={rangeFrom || 'yyyy/mm/dd'}
              allDates={[...allDates].reverse()}
              endOfDay={false}
              onCommit={iso => set({ date_from: iso })}
            />
          </div>

          {/* To */}
          <div>
            <div style={{ fontSize: 9, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
              To
            </div>
            <DateInput
              inputId={`${uid}-to`}
              listId={`${uid}-to-list`}
              committed={toDisplay_}
              placeholder={rangeTo || 'yyyy/mm/dd'}
              allDates={allDates}
              endOfDay={true}
              onCommit={iso => set({ date_to: iso })}
            />
          </div>

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
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 6 }}>
              Saved presets
            </div>
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
        {hasNonDateFilter && !savingPreset && (
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}
            onClick={() => setSavingPreset(true)}>
            <Save size={11} /> Save as preset
          </button>
        )}
        {savingPreset && (
          <div style={{ display: 'flex', gap: 5 }}>
            <input className="input" style={{ flex: 1, fontSize: 12 }} placeholder="Preset name…"
              value={presetName} onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') savePreset() }} />
            <button className="btn btn-primary" style={{ padding: '6px 10px' }} onClick={savePreset}><Save size={12} /></button>
            <button className="btn btn-ghost" style={{ padding: '6px 9px' }} onClick={() => setSavingPreset(false)}><X size={12} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  )
}
