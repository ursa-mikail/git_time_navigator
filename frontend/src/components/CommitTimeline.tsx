import { useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { Commit } from '../types'

interface Props {
  commits: Commit[]
  selectedHash?: string
  onSelect: (c: Commit) => void
  loading?: boolean
}

const BRANCH_COLORS = [
  'var(--accent)',
  'var(--accent-2)',
  'var(--accent-3)',
  'var(--warn)',
  '#f472b6',
  '#fb923c',
]

export function CommitTimeline({ commits, selectedHash, onSelect, loading }: Props) {
  // Defensive: ensure commits is always an array
  const safeCommits = Array.isArray(commits) ? commits : []

  const branchColors = useMemo(() => {
    const map: Record<string, string> = {}
    let i = 0
    safeCommits.forEach(c => {
      if (c?.branch && !map[c.branch]) {
        map[c.branch] = BRANCH_COLORS[i % BRANCH_COLORS.length]
        i++
      }
    })
    return map
  }, [safeCommits])

  if (loading) {
    return (
      <div style={{ padding: '12px 0' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 64, marginBottom: 6, borderRadius: 6, opacity: 1 - i * 0.1 }} />
        ))}
      </div>
    )
  }

  if (safeCommits.length === 0) return null

  return (
    <div style={{ position: 'relative', paddingTop: 4 }}>
      {/* Vertical rail */}
      <div style={{
        position: 'absolute', left: 26, top: 0, bottom: 0,
        width: 2, background: 'var(--border)', zIndex: 0
      }} />

      {safeCommits.map((c, idx) => {
        if (!c) return null
        const selected = c.hash === selectedHash
        const color = branchColors[c.branch] || 'var(--accent)'
        const safeFiles = Array.isArray(c.files_changed) ? c.files_changed : []

        return (
          <div
            key={c.hash || idx}
            onClick={() => onSelect(c)}
            style={{
              position: 'relative', display: 'flex', gap: 14,
              padding: '9px 8px 9px 0',
              cursor: 'pointer',
              background: selected ? 'rgba(110,231,255,0.05)' : 'transparent',
              borderLeft: selected ? '3px solid var(--accent)' : '3px solid transparent',
              paddingLeft: selected ? 7 : 10,
              borderRadius: 4,
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-2)' }}
            onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
          >
            {/* Node */}
            <div style={{ position: 'relative', zIndex: 1, flexShrink: 0, width: 28, display: 'flex', alignItems: 'flex-start', paddingTop: 5 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                border: `2px solid ${color}`,
                background: selected ? color : 'var(--bg)',
                boxShadow: selected ? `0 0 10px ${color}66` : undefined,
                marginLeft: 8, flexShrink: 0,
              }} />
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
                <span className="mono" style={{
                  fontSize: 12, color: color, fontWeight: 700,
                  background: `${color}18`, padding: '1px 6px', borderRadius: 4, flexShrink: 0
                }}>
                  {c.short_hash || c.hash?.slice(0, 7) || '?'}
                </span>
                <span className="mono" style={{
                  fontSize: 10, color: 'var(--txt-3)',
                  background: 'var(--bg-2)', padding: '1px 6px', borderRadius: 4,
                  border: '1px solid var(--border)',
                  maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {c.branch || 'unknown'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--txt-3)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {c.committed_at ? formatDistanceToNow(new Date(c.committed_at), { addSuffix: true }) : ''}
                </span>
              </div>

              <div style={{
                fontSize: 13, color: selected ? 'var(--txt)' : 'var(--txt-2)',
                fontWeight: selected ? 600 : 400,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4
              }}>
                {(c.message || '').split('\n')[0] || '(no message)'}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>{c.author_name || ''}</span>
                {(c.insertions ?? 0) > 0 && <span style={{ fontSize: 11, color: 'var(--added)' }}>+{c.insertions}</span>}
                {(c.deletions ?? 0) > 0 && <span style={{ fontSize: 11, color: 'var(--removed)' }}>-{c.deletions}</span>}
                {safeFiles.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>
                    {safeFiles.length} file{safeFiles.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
