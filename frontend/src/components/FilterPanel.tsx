import { useState, useEffect, useId, useRef } from 'react'
import { Filter, Save, X, RotateCcw, BookmarkPlus, Calendar, ChevronDown, FileText, Info } from 'lucide-react'
import { metaApi } from '../lib/api'
import type { CommitFilter, FilterPreset } from '../types'

interface Props {
  repoId: number
  filter: CommitFilter
  onChange: (f: CommitFilter) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(display: string, endOfDay = false): string | undefined {
  const clean = display.trim().replace(/\//g, '-')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return undefined
  return clean + (endOfDay ? 'T23:59:59Z' : 'T00:00:00Z')
}

function toDisplay(iso: string | undefined): string {
  if (!iso) return ''
  return iso.split('T')[0].replace(/-/g, '/')
}

function isValidDate(s: string): boolean {
  if (!s.trim()) return true
  return /^\d{4}\/\d{2}\/\d{2}$/.test(s.trim())
}

function dateToDisplay(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('/')
}

// ── DateInput — fully controlled with datalist ────────────────────────────────
interface DateInputProps {
  inputId: string
  listId: string
  committed: string
  placeholder: string
  allDates: string[]
  endOfDay?: boolean
  onCommit: (iso: string | undefined) => void
}

function DateInput({ inputId, listId, committed, placeholder, allDates, endOfDay = false, onCommit }: DateInputProps) {
  const [draft, setDraft] = useState(committed)
  const prev = useRef(committed)

  // Sync draft whenever parent pushes a new committed value
  useEffect(() => {
    if (committed !== prev.current) {
      setDraft(committed)
      prev.current = committed
    }
  })

  const flush = (val: string) => {
    const v = val.trim()
    if (!v) { onCommit(undefined); return }
    if (isValidDate(v)) onCommit(toISO(v, endOfDay))
  }

  const invalid = draft.length > 0 && !isValidDate(draft)

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          id={inputId}
          list={listId}
          className="input"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, paddingRight: 26, borderColor: invalid ? 'var(--danger)' : undefined }}
          placeholder={placeholder}
          value={draft}
          onChange={e => {
            const v = e.target.value
            setDraft(v)
            if (!v.trim() || isValidDate(v)) flush(v)
          }}
          onBlur={e => flush(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') flush((e.target as HTMLInputElement).value) }}
        />
        <datalist id={listId}>
          {allDates.map(d => <option key={d} value={d} />)}
        </datalist>
        {allDates.length > 0 && (
          <ChevronDown size={11} color="var(--txt-3)"
            style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        )}
      </div>
      {invalid && <div style={{ fontSize: 9, color: 'var(--danger)', marginTop: 2 }}>Expected yyyy/mm/dd</div>}
    </div>
  )
}

// ── FileInput — text input + datalist of all changed files ────────────────────
interface FileInputProps {
  listId: string
  value: string
  allFiles: string[]
  onChange: (val: string | undefined) => void
}

function FileInput({ listId, value, allFiles, onChange }: FileInputProps) {
  const [showHint, setShowHint] = useState(false)

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <FileText size={13} color="var(--txt-3)"
          style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          list={listId}
          className="input"
          style={{ paddingLeft: 28, paddingRight: 26, fontFamily: 'var(--font-mono)', fontSize: 12 }}
          placeholder="e.g. src/auth/login.py"
          value={value}
          onChange={e => onChange(e.target.value || undefined)}
        />
        <datalist id={listId}>
          {allFiles.map(f => <option key={f} value={f} />)}
        </datalist>
        {allFiles.length > 0 && (
          <ChevronDown size={11} color="var(--txt-3)"
            style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        )}
        <button
          onMouseEnter={() => setShowHint(true)}
          onMouseLeave={() => setShowHint(false)}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'help', color: 'var(--txt-3)', display: 'flex', padding: 0 }}>
          <Info size={12} />
        </button>
      </div>

      {/* Usage hint */}
      {showHint && (
        <div style={{
          marginTop: 6, padding: '8px 10px',
          background: 'var(--bg-3)', border: '1px solid var(--border-hi)',
          borderRadius: 6, fontSize: 10, color: 'var(--txt-2)', lineHeight: 1.7,
          zIndex: 10, position: 'relative',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--txt)', marginBottom: 3 }}>How file path filter works</div>
          Filters commits that <strong>touched this exact file</strong>.<br />
          Type a partial name or pick from the dropdown — it lists the top 200 most-changed files in the repo.<br />
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)' }}>README.md</code>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)' }}>src/auth/login.py</code>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)' }}>package.json</code>
          </div>
        </div>
      )}

      {/* Active file badge */}
      {value && (
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
          <span style={{ color: 'var(--accent-3)' }}>✓</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--txt-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
          <button onClick={() => onChange(undefined)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 0, flexShrink: 0 }}>
            <X size={10} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── FilterPanel ───────────────────────────────────────────────────────────────
export function FilterPanel({ repoId, filter, onChange }: Props) {
  const uid = useId().replace(/:/g, '')

  const [authors,      setAuthors]     = useState<string[]>([])
  const [branches,     setBranches]    = useState<string[]>([])
  const [allDates,     setAllDates]    = useState<string[]>([])
  const [allFiles,     setAllFiles]    = useState<string[]>([])
  const [rangeFrom,    setRangeFrom]   = useState('')
  const [rangeTo,      setRangeTo]     = useState('')
  const [presets,      setPresets]     = useState<FilterPreset[]>([])
  const [presetName,   setPresetName]  = useState('')
  const [savingPreset, setSavingPreset] = useState(false)
  const [loading,      setLoading]     = useState(true)

  const fromDisplay = toDisplay(filter.date_from)
  const toDisplay_  = toDisplay(filter.date_to)

  useEffect(() => {
    if (!repoId) return
    setLoading(true)

    metaApi.authors(repoId).then(d => setAuthors(Array.isArray(d) ? d : [])).catch(() => {})
    metaApi.branches(repoId).then(d => setBranches(Array.isArray(d) ? d : [])).catch(() => {})
    metaApi.presets(repoId).then(d => setPresets(Array.isArray(d) ? d : [])).catch(() => {})
    metaApi.distinctDates(repoId).then(d => setAllDates(Array.isArray(d) ? d : [])).catch(() => {})
    metaApi.distinctFiles(repoId).then(d => setAllFiles(Array.isArray(d) ? d : [])).catch(() => {})

    metaApi.dateRange(repoId)
      .then(r => {
        setRangeFrom(r.from)
        setRangeTo(r.to)
        // Always seed the full range — this sets filter.date_from/to
        // which flows into fromDisplay / toDisplay_ and into DateInput
        onChange({
          ...filter,
          date_from: toISO(r.from, false),
          date_to:   toISO(r.to,   true),
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [repoId])

  const set = (patch: Partial<CommitFilter>) => onChange({ ...filter, ...patch })

  const applyQuickRange = (days: number) => {
    if (days === 0) {
      onChange({ ...filter, date_from: toISO(rangeFrom, false), date_to: toISO(rangeTo, true) })
    } else {
      const to   = new Date()
      const from = new Date()
      from.setDate(from.getDate() - days)
      onChange({ ...filter, date_from: toISO(dateToDisplay(from), false), date_to: toISO(dateToDisplay(to), true) })
    }
  }

  const reset = () => onChange({
    date_from: rangeFrom ? toISO(rangeFrom, false) : undefined,
    date_to:   rangeTo   ? toISO(rangeTo,   true)  : undefined,
  })

  // "All" is active when From/To match the repo boundaries exactly
  const isFullRange = !!(
    rangeFrom && rangeTo &&
    fromDisplay === rangeFrom &&
    toDisplay_  === rangeTo
  )

  const hasNonDateFilter = !!(filter.author || filter.branch || filter.file)

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

        {/* File path — with autocomplete + usage hint */}
        <Field label={
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>File path</span>
            {allFiles.length > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--txt-3)', fontSize: 9 }}>
                ({allFiles.length} files — click ⓘ for help)
              </span>
            )}
          </div>
        }>
          <FileInput
            listId={`${uid}-files`}
            value={filter.file || ''}
            allFiles={allFiles}
            onChange={v => set({ file: v })}
          />
        </Field>

        {/* Date range */}
        <Field label={
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Calendar size={10} />
            <span>Date range</span>
            {allDates.length > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--txt-3)', fontSize: 9 }}>
                ({allDates.length} days with commits)
              </span>
            )}
          </div>
        }>

          {/* All — full width, shows actual date span */}
          <button
            onClick={() => applyQuickRange(0)}
            style={{
              width: '100%', textAlign: 'left', padding: '6px 10px', marginBottom: 6,
              background: isFullRange ? 'rgba(110,231,255,0.1)' : 'var(--bg-3)',
              border: `1px solid ${isFullRange ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 4, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: isFullRange ? 'var(--accent)' : 'var(--txt-2)',
              fontWeight: isFullRange ? 700 : 400,
              transition: 'all 0.12s',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = isFullRange ? 'var(--accent)' : 'var(--border)'; e.currentTarget.style.color = isFullRange ? 'var(--accent)' : 'var(--txt-2)' }}
          >
            <span style={{ opacity: 0.5, fontSize: 12, flexShrink: 0 }}>⟷</span>
            {loading
              ? <span style={{ color: 'var(--txt-3)', fontFamily: 'var(--font-ui)', fontSize: 10 }}>Loading range…</span>
              : rangeFrom && rangeTo
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 1 }}>
                    <span>{rangeFrom}</span>
                    <span style={{ opacity: 0.4, margin: '0 6px' }}>→</span>
                    <span>{rangeTo}</span>
                    {isFullRange && <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.6 }}>✓ all</span>}
                  </span>
                : <span style={{ color: 'var(--txt-3)', fontFamily: 'var(--font-ui)', fontSize: 10 }}>All commits</span>
            }
          </button>

          {/* Relative shortcuts */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {[{ label: 'Last 7d', days: 7 }, { label: 'Last 30d', days: 30 }, { label: 'Last 90d', days: 90 }].map(({ label, days }) => (
              <button key={days} onClick={() => applyQuickRange(days)} style={{
                flex: 1, padding: '3px 0', fontSize: 10,
                background: 'var(--bg-3)', border: '1px solid var(--border)',
                borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-ui)', color: 'var(--txt-3)', transition: 'all 0.1s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--txt-3)' }}
              >{label}</button>
            ))}
          </div>

          {/* From */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>From</div>
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
            <div style={{ fontSize: 9, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>To</div>
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
        {hasNonDateFilter && !savingPreset && (
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }} onClick={() => setSavingPreset(true)}>
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
