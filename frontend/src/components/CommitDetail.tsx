import { useState, useEffect, useRef } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  GitCommit, User, Clock, GitBranch, ChevronRight,
  Zap, RotateCcw, GitFork, Upload, X, AlertTriangle,
  CheckCircle2, FolderTree, GitCompare, Loader2,
  Copy, Check, Terminal, ArrowRight, ShieldAlert,
  ChevronDown, ChevronUp, Minus, Plus
} from 'lucide-react'
import type { Commit, DiffFile } from '../types'
import { actionApi, commitApi } from '../lib/api'
import { FileTree } from './FileTree'

interface Props {
  commit: Commit | null
  repoId: number
  apiToken: string
  onClose: () => void
  onSwitched?: (hash: string, mode: string) => void
}

type Mode = 'checkout' | 'reset' | 'branch' | 'push'
type RightTab = 'info' | 'tree' | 'diff'
type SwitchPhase = 'idle' | 'confirm' | 'executing' | 'done' | 'error'

const MODES: {
  id: Mode; label: string; icon: React.ReactNode
  desc: string; detail: string; danger?: boolean; requiresBranch?: boolean; requiresToken?: boolean
}[] = [
  {
    id: 'checkout', label: 'Checkout', icon: <Zap size={13} />,
    desc: 'Detached HEAD — safe, read-only',
    detail: 'Switches your working directory to this exact commit. No branches are modified. Great for reading or building from this snapshot.'
  },
  {
    id: 'branch', label: 'New Branch', icon: <GitFork size={13} />,
    desc: 'Create a new branch from here',
    detail: 'Creates a new branch starting at this commit and switches to it. Your current branch stays untouched. Ideal for experimenting.',
    requiresBranch: true
  },
  {
    id: 'reset', label: 'Hard Reset', icon: <RotateCcw size={13} />,
    desc: 'Rewrite current branch to this point',
    detail: 'Moves your current branch HEAD here, permanently discarding all commits after this point locally. Remote is unaffected unless you also force push.',
    danger: true
  },
  {
    id: 'push', label: 'Force Push', icon: <Upload size={13} />,
    desc: 'Overwrite remote branch with this commit',
    detail: 'Updates the remote branch to point at this commit, rewriting remote history. Requires a GitHub token. All collaborators must re-clone or rebase.',
    danger: true, requiresBranch: true, requiresToken: true
  },
]

export function CommitDetail({ commit, repoId, apiToken, onClose, onSwitched }: Props) {
  const [tab, setTab] = useState<RightTab>('info')
  const [mode, setMode] = useState<Mode>('checkout')
  const [branchName, setBranchName] = useState('')
  const [phase, setPhase] = useState<SwitchPhase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [diff, setDiff] = useState<DiffFile[] | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [copiedHash, setCopiedHash] = useState(false)
  const [switchPanelOpen, setSwitchPanelOpen] = useState(false)
  const branchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPhase('idle')
    setErrorMsg('')
    setBranchName('')
    setSwitchPanelOpen(false)
    setDiff(null)
    setTab('info')
  }, [commit?.hash])

  useEffect(() => {
    const parentHash = Array.isArray(commit?.parents) ? commit.parents[0] : null
    if (tab !== 'diff' || !parentHash) return
    if (diff !== null) return
    setDiffLoading(true)
    commitApi.diff(repoId, parentHash, commit!.hash)
      .then(d => setDiff(Array.isArray(d) ? d : []))
      .catch(() => setDiff([]))
      .finally(() => setDiffLoading(false))
  }, [tab, commit, repoId, diff])

  useEffect(() => {
    if ((mode === 'branch' || mode === 'push') && switchPanelOpen) {
      setTimeout(() => branchInputRef.current?.focus(), 80)
    }
  }, [mode, switchPanelOpen])

  if (!commit) return null

  // Defensive normalisation — backend may return null for empty arrays
  const safeParents      = Array.isArray(commit.parents)       ? commit.parents       : []
  const safeFiles        = Array.isArray(commit.files_changed) ? commit.files_changed : []

  const selectedMode = MODES.find(m => m.id === mode)!
  const needsBranch = selectedMode.requiresBranch
  const needsToken = selectedMode.requiresToken
  const canExecute = (!needsBranch || branchName.trim().length > 0) && (!needsToken || !!apiToken)

  const copyHash = () => {
    navigator.clipboard.writeText(commit.hash)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 1500)
  }

  const handleExecute = async () => {
    if (!canExecute) return
    setPhase('executing')
    setErrorMsg('')
    try {
      await actionApi.switch({
        repo_id: repoId,
        hash: commit.hash,
        mode,
        branch: branchName.trim() || undefined,
        api_token: apiToken || undefined,
      })
      setPhase('done')
      onSwitched?.(commit.hash, mode)
    } catch (e: any) {
      setPhase('error')
      setErrorMsg(e.response?.data?.error || e.message || 'Unknown error')
    }
  }

  const messageLines = commit.message.split('\n')
  const titleLine = messageLines[0]
  const bodyLines = messageLines.slice(1).join('\n').trim()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-1)', overflow: 'hidden' }}>

      {/* ── Commit identity bar ── */}
      <div style={{
        flexShrink: 0, padding: '12px 14px',
        background: 'linear-gradient(160deg, rgba(110,231,255,0.07) 0%, rgba(167,139,250,0.06) 100%)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {/* Clickable hash pill */}
          <div
            onClick={copyHash}
            title="Click to copy full hash"
            style={{
              display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0,
              background: 'rgba(110,231,255,0.08)', border: '1px solid rgba(110,231,255,0.22)',
              borderRadius: 6, padding: '5px 10px', cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(110,231,255,0.5)'}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(110,231,255,0.22)'}
          >
            <GitCommit size={13} color="var(--accent)" />
            <span className="mono" style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.06em' }}>
              {commit.short_hash}
            </span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--txt-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {commit.hash.slice(7, 22)}…
            </span>
            <span style={{ marginLeft: 'auto', color: 'var(--txt-3)', flexShrink: 0 }}>
              {copiedHash ? <Check size={11} color="var(--accent-3)" /> : <Copy size={11} />}
            </span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 6,
            transition: 'all 0.12s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hi)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--txt)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--txt-3)' }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', lineHeight: 1.45, marginBottom: 8 }}>
          {titleLine}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11, color: 'var(--txt-3)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <User size={10} /> {commit.author_name}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} /> {formatDistanceToNow(new Date(commit.committed_at), { addSuffix: true })}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <GitBranch size={10} />
            <span className="mono" style={{ fontSize: 10 }}>{commit.branch}</span>
          </span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flexShrink: 0 }}>
        {([
          { id: 'info' as RightTab,  label: 'Info',    icon: <GitCommit size={12} /> },
          { id: 'tree' as RightTab,  label: 'Tree',    icon: <FolderTree size={12} /> },
          { id: 'diff' as RightTab,  label: 'Diff',    icon: <GitCompare size={12} />, badge: safeFiles.length },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '9px 4px', border: 'none',
            background: tab === t.id ? 'var(--bg)' : 'transparent',
            color: tab === t.id ? 'var(--txt)' : 'var(--txt-3)',
            fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
            cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.12s'
          }}>
            {t.icon} {t.label}
            {t.badge != null && t.badge > 0 && (
              <span style={{
                background: 'var(--bg-3)', border: '1px solid var(--border)',
                borderRadius: 100, fontSize: 9, padding: '1px 5px', color: 'var(--txt-3)'
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: tab === 'tree' ? 'flex' : 'block', flexDirection: 'column' }}>

        {/* INFO TAB */}
        {tab === 'info' && (
          <div style={{ padding: '14px 14px 0' }}>
            {bodyLines && (
              <div className="mono" style={{
                fontSize: 11, color: 'var(--txt-3)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
                padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 6, marginBottom: 14
              }}>{bodyLines}</div>
            )}

            {/* Stat pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <StatPill label="Files"   value={safeFiles.length || 0} color="var(--txt)" />
              <StatPill label="Added"   value={`+${commit.insertions}`}            color="var(--added)" />
              <StatPill label="Removed" value={`-${commit.deletions}`}             color="var(--removed)" />
            </div>

            {/* Meta table */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
              <MetaRow icon={<User size={11} />} label="Author">
                <span style={{ fontWeight: 600 }}>{commit.author_name}</span>
                <span style={{ color: 'var(--txt-3)', fontSize: 10, marginLeft: 6 }}>{commit.author_email}</span>
              </MetaRow>
              <MetaRow icon={<Clock size={11} />} label="Date">
                {format(new Date(commit.committed_at), 'PPP · p')}
              </MetaRow>
              <MetaRow icon={<GitBranch size={11} />} label="Branch">
                <span className="mono" style={{ fontSize: 11, color: 'var(--accent-2)' }}>{commit.branch}</span>
              </MetaRow>
              {safeParents.length > 0 && (
                <MetaRow icon={<GitCommit size={11} />} label="Parents">
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {safeParents.map(p => (
                      <span key={p} className="mono" style={{
                        fontSize: 10, background: 'var(--bg)', border: '1px solid var(--border)',
                        padding: '1px 6px', borderRadius: 4, color: 'var(--txt-3)'
                      }}>{p.slice(0, 7)}</span>
                    ))}
                  </div>
                </MetaRow>
              )}
            </div>

            {/* Changed files */}
            {safeFiles.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 6 }}>
                  Changed files
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
                  {safeFiles.map((f, i) => {
                    const ext = f.split('.').pop()?.toLowerCase() || ''
                    const extColors: Record<string, string> = {
                      ts: '#3b82f6', tsx: '#3b82f6', js: '#eab308', jsx: '#eab308',
                      go: '#06b6d4', py: '#10b981', rs: '#f97316', css: '#a78bfa',
                      scss: '#ec4899', html: '#f87171', md: '#94a3b8', json: '#34d399',
                      sh: '#6ee7ff', sql: '#60a5fa', yaml: '#fbbf24', toml: '#fb923c',
                    }
                    const dotColor = extColors[ext] || 'var(--txt-3)'
                    return (
                      <div key={f} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                        borderBottom: i < safeFiles.length - 1 ? '1px solid var(--border)' : 'none',
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        cursor: 'pointer', transition: 'background 0.1s'
                      }}
                        onClick={() => setTab('tree')}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-3)')}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}
                        title="Click to open Tree view"
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                        <span className="mono" style={{ fontSize: 11, color: 'var(--txt-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {f}
                        </span>
                        <ChevronRight size={10} color="var(--txt-3)" />
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 10, color: 'var(--txt-3)', marginTop: 5, textAlign: 'center' }}>
                  Click a file to jump to Tree view
                </div>
              </div>
            )}
          </div>
        )}

        {/* TREE TAB */}
        {tab === 'tree' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <FileTree repoId={repoId} hash={commit.hash} shortHash={commit.short_hash} />
          </div>
        )}

        {/* DIFF TAB */}
        {tab === 'diff' && (
          <div style={{ padding: '10px 14px' }}>
            {!safeParents[0] && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--txt-3)', fontSize: 12 }}>
                This is the initial commit — no parent to diff against.
              </div>
            )}
            {safeParents[0] && diffLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8, color: 'var(--txt-3)', fontSize: 12 }}>
                <Loader2 size={15} className="spin" /> Computing diff…
              </div>
            )}
            {diff && diff.length === 0 && !diffLoading && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--txt-3)', fontSize: 12 }}>No changes detected.</div>
            )}
            {diff && diff.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--txt-3)', marginBottom: 10 }}>
                  {diff.length} file{diff.length !== 1 ? 's' : ''} changed vs&nbsp;
                  <span className="mono" style={{ color: 'var(--accent)' }}>{safeParents[0].slice(0, 7)}</span>
                </div>
                {diff.map(f => <DiffFileCard key={f.path} file={f} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ⏱ Time Travel Panel (sticky bottom) ── */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid var(--border-hi)',
        background: 'var(--bg)',
      }}>
        {/* Collapsed trigger */}
        {!switchPanelOpen && (
          <button
            onClick={() => { setSwitchPanelOpen(true); setPhase('confirm') }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, color: 'var(--accent)',
              letterSpacing: '0.01em', transition: 'background 0.15s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(110,231,255,0.05)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
          >
            <Zap size={15} />
            Travel to&nbsp;
            <span className="mono" style={{ background: 'rgba(110,231,255,0.12)', padding: '1px 8px', borderRadius: 4, fontSize: 12 }}>
              {commit.short_hash}
            </span>
            <ChevronUp size={14} style={{ marginLeft: 'auto', color: 'var(--txt-3)' }} />
          </button>
        )}

        {/* Expanded */}
        {switchPanelOpen && (
          <div style={{ padding: '12px 14px 14px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Zap size={14} color="var(--accent)" />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', flex: 1 }}>
                Travel to <span className="mono" style={{ color: 'var(--accent)' }}>{commit.short_hash}</span>
              </span>
              <button onClick={() => { setSwitchPanelOpen(false); setPhase('idle') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 2 }}>
                <ChevronDown size={14} />
              </button>
            </div>

            {/* idle / confirm */}
            {(phase === 'idle' || phase === 'confirm') && (
              <>
                {/* Mode grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10 }}>
                  {MODES.map(m => {
                    const active = mode === m.id
                    return (
                      <button key={m.id}
                        onClick={() => setMode(m.id)}
                        title={m.desc}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
                          borderRadius: 6, border: '1px solid',
                          cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-ui)',
                          transition: 'all 0.12s',
                          borderColor: active ? (m.danger ? 'var(--danger)' : 'var(--accent)') : 'var(--border)',
                          background: active
                            ? (m.danger ? 'rgba(248,113,113,0.1)' : 'rgba(110,231,255,0.08)')
                            : 'var(--bg-2)',
                          color: active ? (m.danger ? 'var(--danger)' : 'var(--accent)') : 'var(--txt-3)',
                          boxShadow: active
                            ? `0 0 0 1px ${m.danger ? 'rgba(248,113,113,0.2)' : 'rgba(110,231,255,0.15)'}`
                            : 'none',
                        }}>
                        {m.icon} {m.label}
                        {m.danger && <ShieldAlert size={10} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                      </button>
                    )
                  })}
                </div>

                {/* Description */}
                <div style={{
                  padding: '9px 11px', background: 'var(--bg-2)',
                  border: '1px solid var(--border)', borderRadius: 6, marginBottom: 10,
                  fontSize: 11, color: 'var(--txt-2)', lineHeight: 1.65
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                    <Terminal size={11} style={{ color: 'var(--accent-2)', flexShrink: 0, marginTop: 2 }} />
                    <span>{selectedMode.detail}</span>
                  </div>
                </div>

                {/* Branch input */}
                {needsBranch && (
                  <input
                    ref={branchInputRef}
                    className="input"
                    style={{ marginBottom: 10, fontSize: 12 }}
                    placeholder={mode === 'push' ? 'Remote branch name…' : 'New branch name…'}
                    value={branchName}
                    onChange={e => setBranchName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && canExecute) handleExecute() }}
                  />
                )}

                {/* Token warning */}
                {needsToken && !apiToken && (
                  <div style={{
                    display: 'flex', gap: 7, alignItems: 'flex-start', padding: '8px 10px', marginBottom: 10,
                    background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)',
                    borderRadius: 6, fontSize: 11, color: 'var(--warn)', lineHeight: 1.5
                  }}>
                    <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                    GitHub token required. Add it via Settings (⚙️).
                  </div>
                )}

                {/* Danger warning */}
                {selectedMode.danger && (
                  <div style={{
                    display: 'flex', gap: 7, alignItems: 'flex-start', padding: '8px 10px', marginBottom: 10,
                    background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)',
                    borderRadius: 6, fontSize: 11, color: 'var(--danger)', lineHeight: 1.5
                  }}>
                    <ShieldAlert size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                    Destructive — rewrites history and cannot be easily undone.
                  </div>
                )}

                {/* THE BIG BUTTON */}
                <button
                  onClick={handleExecute}
                  disabled={!canExecute}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px 16px', borderRadius: 6, border: 'none', cursor: canExecute ? 'pointer' : 'not-allowed',
                    fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700,
                    transition: 'all 0.15s',
                    opacity: canExecute ? 1 : 0.4,
                    background: selectedMode.danger
                      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                      : 'linear-gradient(135deg, var(--accent), #38bdf8)',
                    color: selectedMode.danger ? '#fff' : '#000',
                    boxShadow: canExecute
                      ? selectedMode.danger
                        ? '0 4px 20px rgba(239,68,68,0.3)'
                        : '0 4px 20px rgba(110,231,255,0.25)'
                      : 'none',
                  }}
                >
                  {selectedMode.icon}
                  {selectedMode.label}
                  <ArrowRight size={14} />
                  <span className="mono" style={{ fontSize: 12, opacity: 0.8 }}>{commit.short_hash}</span>
                </button>
              </>
            )}

            {/* executing */}
            {phase === 'executing' && (
              <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: '50%',
                  border: '3px solid var(--border-hi)',
                  borderTop: '3px solid var(--accent)',
                  animation: 'spin 0.75s linear infinite'
                }} />
                <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 600 }}>
                  Running {selectedMode.label}…
                </div>
                <div className="mono" style={{
                  fontSize: 10, color: 'var(--txt-3)', background: 'var(--bg-2)',
                  border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px'
                }}>
                  $ git {mode === 'checkout' ? `checkout ${commit.short_hash}` : mode === 'reset' ? `reset --hard ${commit.short_hash}` : mode === 'branch' ? `checkout -b ${branchName || '<branch>'} ${commit.short_hash}` : `push origin ${commit.short_hash}:${branchName || '<branch>'} --force`}
                </div>
              </div>
            )}

            {/* done */}
            {phase === 'done' && (
              <div style={{ padding: '12px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: '50%',
                    background: 'rgba(52,211,153,0.1)', border: '2px solid var(--accent-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <CheckCircle2 size={22} color="var(--accent-3)" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-3)' }}>Switched!</div>
                  <div style={{ fontSize: 11, color: 'var(--txt-3)', textAlign: 'center', lineHeight: 1.6 }}>
                    Repo is now at&nbsp;
                    <span className="mono" style={{ color: 'var(--accent)' }}>{commit.short_hash}</span>
                    {branchName && <> on <span className="mono" style={{ color: 'var(--accent-2)' }}>{branchName}</span></>}
                  </div>
                </div>
                <button onClick={() => { setSwitchPanelOpen(false); setPhase('idle') }}
                  className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
                  Done
                </button>
              </div>
            )}

            {/* error */}
            {phase === 'error' && (
              <div style={{ padding: '8px 0' }}>
                <div style={{
                  padding: '10px 12px', marginBottom: 10,
                  background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)',
                  borderRadius: 6
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>
                    Operation failed
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--danger)', opacity: 0.85, lineHeight: 1.5 }}>
                    {errorMsg}
                  </div>
                </div>
                <button onClick={() => setPhase('confirm')}
                  className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}>
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      padding: '8px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6
    }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: color || 'var(--txt)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--txt-3)', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}

function MetaRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 12px',
      borderBottom: '1px solid var(--border)', fontSize: 12, lastChild: { borderBottom: 'none' }
    } as React.CSSProperties}>
      <span style={{ color: 'var(--txt-3)', flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span style={{ color: 'var(--txt-3)', flexShrink: 0, minWidth: 42, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 1 }}>{label}</span>
      <span style={{ color: 'var(--txt-2)', flex: 1, minWidth: 0, wordBreak: 'break-all', fontSize: 12 }}>{children}</span>
    </div>
  )
}

function DiffFileCard({ file }: { file: DiffFile }) {
  const [expanded, setExpanded] = useState(false)

  const STATUS: Record<string, { label: string; color: string }> = {
    added:    { label: 'A', color: 'var(--added)' },
    removed:  { label: 'D', color: 'var(--removed)' },
    modified: { label: 'M', color: 'var(--accent-2)' },
    renamed:  { label: 'R', color: 'var(--warn)' },
  }
  const s = STATUS[file.status] || { label: '?', color: 'var(--txt-3)' }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
      <div
        onClick={() => setExpanded(x => !x)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
          cursor: 'pointer', userSelect: 'none', background: 'var(--bg-2)', transition: 'background 0.1s'
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-3)')}
        onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-2)')}
      >
        <span style={{
          width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${s.color}18`, border: `1px solid ${s.color}44`,
          fontSize: 9, fontWeight: 800, color: s.color, flexShrink: 0
        }}>{s.label}</span>
        <span className="mono" style={{ flex: 1, fontSize: 11, color: 'var(--txt-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.path}
        </span>
        <span style={{ fontSize: 10, color: 'var(--added)' }}>+{file.additions}</span>
        <span style={{ fontSize: 10, color: 'var(--removed)' }}>-{file.deletions}</span>
        <ChevronRight size={12} color="var(--txt-3)" style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s', flexShrink: 0 }} />
      </div>

      {expanded && file.patch && (
        <div style={{ borderTop: '1px solid var(--border)', maxHeight: 340, overflowY: 'auto' }}>
          <div className="mono" style={{ fontSize: 10, lineHeight: 1.7 }}>
            {file.patch.split('\n').map((line, i) => {
              const isAdd = line.startsWith('+') && !line.startsWith('+++')
              const isDel = line.startsWith('-') && !line.startsWith('---')
              const isHunk = line.startsWith('@@')
              return (
                <div key={i} style={{
                  display: 'flex',
                  background: isAdd ? 'rgba(52,211,153,0.08)' : isDel ? 'rgba(248,113,113,0.08)' : isHunk ? 'rgba(167,139,250,0.07)' : 'transparent',
                  borderLeft: isAdd ? '2px solid rgba(52,211,153,0.6)' : isDel ? '2px solid rgba(248,113,113,0.6)' : isHunk ? '2px solid rgba(167,139,250,0.6)' : '2px solid transparent',
                }}>
                  <span style={{
                    minWidth: 30, padding: '0 6px', color: 'var(--txt-3)', textAlign: 'right',
                    userSelect: 'none', fontSize: 9, borderRight: '1px solid var(--border)', flexShrink: 0, lineHeight: 1.7
                  }}>{i + 1}</span>
                  <span style={{
                    paddingLeft: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1,
                    color: isAdd ? 'var(--added)' : isDel ? 'var(--removed)' : isHunk ? 'var(--accent-2)' : 'var(--txt-2)'
                  }}>{line || '\u00A0'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
