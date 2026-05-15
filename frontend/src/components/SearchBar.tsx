import { useState, useRef, useEffect } from 'react'
import { Search, X, GitCommit, User, GitBranch } from 'lucide-react'
import { commitApi } from '../lib/api'
import { useDebounce } from '../hooks/useDebounce'
import type { AutocompleteResult } from '../types'

interface Props {
  repoId: number
  value: string
  onChange: (v: string) => void
  onSelect?: (type: string, value: string) => void
}

const EMPTY: AutocompleteResult = { authors: [], branches: [], files: [], commits: [] }

export function SearchBar({ repoId, value, onChange, onSelect }: Props) {
  const [open,    setOpen]    = useState(false)
  const [results, setResults] = useState<AutocompleteResult>(EMPTY)
  const [loading, setLoading] = useState(false)
  const debouncedQ = useDebounce(value, 260)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!debouncedQ || debouncedQ.length < 1) {
      setResults(EMPTY)
      setOpen(false)
      return
    }
    setLoading(true)
    commitApi.autocomplete(repoId, debouncedQ)
      .then(r => {
        // Normalise — backend may return null for empty arrays
        const safe: AutocompleteResult = {
          authors:  Array.isArray(r?.authors)  ? r.authors  : [],
          branches: Array.isArray(r?.branches) ? r.branches : [],
          files:    Array.isArray(r?.files)    ? r.files    : [],
          commits:  Array.isArray(r?.commits)  ? r.commits  : [],
        }
        setResults(safe)
        const hasAny = safe.authors.length + safe.branches.length + safe.commits.length > 0
        setOpen(hasAny)
      })
      .catch(() => { setResults(EMPTY); setOpen(false) })
      .finally(() => setLoading(false))
  }, [debouncedQ, repoId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pick = (type: string, val: string) => {
    setOpen(false)
    onSelect?.(type, val)
  }

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-1)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)', padding: '7px 12px',
        boxShadow: open ? '0 0 0 3px rgba(110,231,255,0.1)' : 'none',
        transition: 'all 0.15s'
      }}>
        {loading
          ? <span style={{ width: 15, height: 15, border: '2px solid var(--border-hi)', borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          : <Search size={15} color="var(--txt-3)" style={{ flexShrink: 0 }} />
        }
        <input
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--txt)', fontFamily: 'var(--font-mono)', fontSize: 13, minWidth: 0 }}
          placeholder="Search commits, authors, hashes…"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { if (results.authors.length + results.branches.length + results.commits.length > 0) setOpen(true) }}
        />
        {value && (
          <button onClick={() => { onChange(''); setOpen(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 0, flexShrink: 0 }}>
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <div className="card" style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, zIndex: 50, maxHeight: 360, overflowY: 'auto' }}>
          {results.authors.length > 0 && (
            <Section label="Authors">
              {results.authors.map(a => (
                <Row key={a} icon={<User size={12} />} label={a} sub="author" onClick={() => pick('author', a)} />
              ))}
            </Section>
          )}
          {results.branches.length > 0 && (
            <Section label="Branches">
              {results.branches.map(b => (
                <Row key={b} icon={<GitBranch size={12} />} label={b} sub="branch" onClick={() => pick('branch', b)} />
              ))}
            </Section>
          )}
          {results.commits.length > 0 && (
            <Section label="Commits">
              {results.commits.map(c => (
                <Row key={c.hash} icon={<GitCommit size={12} />}
                  label={(c.message || '').slice(0, 60)}
                  sub={(c.hash || '').slice(0, 7)}
                  onClick={() => pick('hash', c.hash)} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ padding: '7px 12px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--txt-3)', borderBottom: '1px solid var(--border)' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Row({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt)', textAlign: 'left' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-3)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      <span style={{ color: 'var(--txt-3)', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span className="mono" style={{ fontSize: 10, color: 'var(--txt-3)', flexShrink: 0 }}>{sub}</span>
    </button>
  )
}
