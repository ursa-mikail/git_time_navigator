import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Settings, RefreshCw, Plus, Trash2, Key, X, BookOpen,
  GitBranch, BarChart2, Clock, ChevronLeft, Loader2
} from 'lucide-react'
import { OnboardingSetup } from './components/OnboardingSetup'
import { CommitTimeline } from './components/CommitTimeline'
import { CommitDetail } from './components/CommitDetail'
import { FilterPanel } from './components/FilterPanel'
import { Charts } from './components/Charts'
import { SearchBar } from './components/SearchBar'
import { ToastStack, useToasts } from './components/ToastStack'
import { useWebSocket } from './hooks/useWebSocket'
import { useDebounce } from './hooks/useDebounce'
import { repoApi, commitApi } from './lib/api'
import type { Repository, Commit, CommitFilter } from './types'

// ─── Three explicit screens ───────────────────────────────────────────────────
type Screen = 'loading' | 'onboarding' | 'app'

export default function App() {
  const [screen, setScreen]             = useState<Screen>('loading')
  const [repos, setRepos]               = useState<Repository[]>([])
  const [activeRepo, setActiveRepo]     = useState<Repository | null>(null)
  const [apiToken, setApiToken]         = useState('')
  const [sshKeyPath, setSshKeyPath]     = useState('~/.ssh/id_ed25519')
  const [commits, setCommits]           = useState<Commit[]>([])
  const [total, setTotal]               = useState(0)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null)
  const [filter, setFilter]             = useState<CommitFilter>({})
  const [searchQ, setSearchQ]           = useState('')
  const [centerTab, setCenterTab]       = useState<'timeline' | 'charts'>('timeline')
  const [filterOpen, setFilterOpen]     = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [syncing, setSyncing]           = useState(false)
  const [syncMsg, setSyncMsg]           = useState('')
  const { toasts, add: addToast, dismiss, update: updateToast } = useToasts()
  const syncToastRef = useRef<string | null>(null)

  const debouncedQ = useDebounce(searchQ, 300)

  // ── 1. Boot: check if backend is up and repos exist ─────────────────────
  useEffect(() => {
    repoApi.list()
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setRepos(list)
        if (list.length > 0) {
          setActiveRepo(list[0])
          setScreen('app')
        } else {
          setScreen('onboarding')
        }
      })
      .catch(err => {
        console.error('Boot error:', err)
        // Backend might not be ready yet - show onboarding anyway
        setScreen('onboarding')
      })
  }, [])

  // ── 2. Load commits when repo or filter changes ──────────────────────────
  useEffect(() => {
    if (!activeRepo) return
    setCommitsLoading(true)
    setCommits([])
    const f: CommitFilter = { ...filter }
    if (debouncedQ) f.q = debouncedQ
    commitApi.list(activeRepo.id, f)
      .then(res => {
        setCommits(res.commits ?? [])
        setTotal(res.total ?? 0)
      })
      .catch(err => {
        console.error('Commits load error:', err)
        setCommits([])
        setTotal(0)
      })
      .finally(() => setCommitsLoading(false))
  }, [activeRepo?.id, filter, debouncedQ])

  // ── 3. WebSocket for real-time sync progress ─────────────────────────────
  useWebSocket(useCallback((msg) => {
    if (msg.type === 'sync_start') {
      setSyncing(true)
      setSyncMsg(String(msg.payload.message ?? 'Cloning…'))
      syncToastRef.current = addToast({ type: 'loading', message: String(msg.payload.message ?? 'Cloning…') })

    } else if (msg.type === 'sync_progress') {
      setSyncMsg(String(msg.payload.message ?? 'Indexing…'))
      if (syncToastRef.current) {
        updateToast(syncToastRef.current, { message: String(msg.payload.message ?? 'Indexing…') })
      }

    } else if (msg.type === 'sync_done') {
      setSyncing(false)
      setSyncMsg('')
      if (syncToastRef.current) {
        updateToast(syncToastRef.current, {
          type: 'success',
          message: String(msg.payload.message ?? 'Ready!')
        })
        syncToastRef.current = null
      }
      // Reload commits for active repo
      const doneRepoId = Number(msg.payload.repo_id)
      setActiveRepo(prev => {
        if (prev?.id === doneRepoId) {
          commitApi.list(prev.id, {})
            .then(res => { setCommits(res.commits ?? []); setTotal(res.total ?? 0) })
            .catch(() => {})
        }
        return prev
      })
      // Refresh repo list
      repoApi.list().then(list => setRepos(Array.isArray(list) ? list : [])).catch(() => {})

    } else if (msg.type === 'sync_error') {
      setSyncing(false)
      setSyncMsg('')
      if (syncToastRef.current) {
        updateToast(syncToastRef.current, {
          type: 'error',
          message: `Error: ${msg.payload.error}`
        })
        syncToastRef.current = null
      }

    } else if (msg.type === 'version_switched') {
      addToast({ type: 'success', message: `Switched to ${String(msg.payload.hash).slice(0, 7)}` })
    }
  }, [addToast, updateToast]))

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleRepoAdded(repo: Repository, token: string, sshKey: string) {
    setApiToken(token)
    setSshKeyPath(sshKey || '~/.ssh/id_ed25519')
    setActiveRepo(repo)
    setRepos(prev => {
      const exists = prev.find(r => r.id === repo.id)
      return exists ? prev.map(r => r.id === repo.id ? repo : r) : [repo, ...prev]
    })
    setCommits([])
    setTotal(0)
    setSelectedCommit(null)
    setFilter({})
    setScreen('app')
    // Sync starts automatically via WS — setSyncing will be triggered by sync_start
  }

  function handleSelectRepo(id: number) {
    const r = repos.find(x => x.id === id)
    if (r) {
      setActiveRepo(r)
      setSelectedCommit(null)
      setFilter({})
      setSearchQ('')
      setCommits([])
    }
  }

  async function handleSync() {
    if (!activeRepo || syncing) return
    try {
      await repoApi.sync(activeRepo.id, apiToken || undefined, sshKeyPath || undefined)
    } catch (e) {
      addToast({ type: 'error', message: 'Sync request failed' })
    }
  }

  async function handleDeleteRepo(id: number) {
    if (!confirm('Remove this repository?')) return
    try {
      await repoApi.delete(id)
    } catch { /* ignore */ }
    const updated = repos.filter(r => r.id !== id)
    setRepos(updated)
    if (activeRepo?.id === id) {
      const next = updated[0] ?? null
      setActiveRepo(next)
      setSelectedCommit(null)
      setCommits([])
      setTotal(0)
      if (!next) setScreen('onboarding')
    }
  }

  function handleAutocomplete(type: string, value: string) {
    if (type === 'author') setFilter(f => ({ ...f, author: value }))
    else if (type === 'branch') setFilter(f => ({ ...f, branch: value }))
    else if (type === 'hash') {
      const c = commits.find(x => x.hash === value || x.short_hash === value)
      if (c) setSelectedCommit(c)
    }
    setSearchQ('')
  }

  // ── Screen: loading ───────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--bg)'
      }}>
        <span style={{ fontSize: 48 }}>⏱</span>
        <Loader2 size={22} color="var(--accent)" className="spin" />
        <span style={{ color: 'var(--txt-3)', fontSize: 13 }}>Connecting…</span>
      </div>
    )
  }

  // ── Screen: onboarding ────────────────────────────────────────────────────
  if (screen === 'onboarding') {
    return (
      <>
        <OnboardingSetup onRepoAdded={handleRepoAdded} />
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </>
    )
  }

  // ── Screen: main app ──────────────────────────────────────────────────────
  const activeFilters = Object.entries(filter).filter(([, v]) => v !== undefined && v !== '')

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Sync overlay ── */}
      {syncing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(10,11,15,0.88)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 24
        }}>
          <span style={{ fontSize: 48 }}>⏱</span>
          <div style={{ position: 'relative', width: 64, height: 64 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '3px solid var(--border-hi)',
              borderTopColor: 'var(--accent)',
              animation: 'spin 0.9s linear infinite'
            }} />
            <div style={{
              position: 'absolute', inset: 8, borderRadius: '50%',
              border: '2px solid var(--border)',
              borderBottomColor: 'var(--accent-2)',
              animation: 'spin 1.4s linear infinite reverse'
            }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--txt)', marginBottom: 6 }}>
              {syncMsg || 'Syncing repository…'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>
              Commits will appear automatically when ready
            </div>
          </div>
          <div style={{ width: 260, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: 'linear-gradient(90deg, var(--accent), var(--accent-2), var(--accent))',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s ease infinite'
            }} />
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header style={{
        height: 50, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 12px', background: 'var(--bg-1)',
        borderBottom: '1px solid var(--border)', zIndex: 20
      }}>
        {/* Logo */}
        <span style={{ fontSize: 18 }}>⏱</span>
        <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.02em', flexShrink: 0 }}>
          Git Time Navigator
        </span>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Repo selector */}
        <select
          className="select"
          value={activeRepo?.id ?? ''}
          style={{ maxWidth: 200, flexShrink: 0 }}
          onChange={e => handleSelectRepo(Number(e.target.value))}
        >
          {repos.map(r => (
            <option key={r.id} value={r.id}>{r.owner}/{r.name}</option>
          ))}
        </select>

        {/* Search */}
        {activeRepo && (
          <SearchBar
            repoId={activeRepo.id}
            value={searchQ}
            onChange={setSearchQ}
            onSelect={handleAutocomplete}
          />
        )}

        {/* Right */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {total > 0 && !commitsLoading && (
            <span style={{ fontSize: 11, color: 'var(--txt-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="live-dot" />
              {total.toLocaleString()} commits
            </span>
          )}
          {commitsLoading && (
            <Loader2 size={13} color="var(--txt-3)" className="spin" />
          )}
          <Hdr title="Add repo" onClick={() => setScreen('onboarding')}><Plus size={14} /></Hdr>
          <Hdr title="Sync" onClick={handleSync} disabled={syncing}><RefreshCw size={14} className={syncing ? 'spin' : ''} /></Hdr>
          <Hdr title="Settings" onClick={() => setSettingsOpen(s => !s)}><Settings size={14} /></Hdr>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: filters */}
        <aside style={{
          width: filterOpen ? 210 : 34, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-1)', transition: 'width 0.18s ease',
          overflow: 'hidden'
        }}>
          {filterOpen ? (
            <>
              {activeRepo && (
                <FilterPanel
                  repoId={activeRepo.id}
                  filter={filter}
                  onChange={f => { setFilter(f); setSelectedCommit(null) }}
                />
              )}
              <button
                onClick={() => setFilterOpen(false)}
                style={{ padding: 8, borderTop: '1px solid var(--border)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', justifyContent: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <ChevronLeft size={14} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setFilterOpen(true)}
              style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14, gap: 8 }}
              title="Filters"
            >
              <GitBranch size={15} />
              {activeFilters.length > 0 && (
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeFilters.length}
                </span>
              )}
            </button>
          )}
        </aside>

        {/* Center: timeline / charts */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flexShrink: 0 }}>
            {(['timeline', 'charts'] as const).map(t => (
              <button key={t} onClick={() => setCenterTab(t)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13,
                fontWeight: centerTab === t ? 600 : 400,
                color: centerTab === t ? 'var(--txt)' : 'var(--txt-3)',
                background: centerTab === t ? 'var(--bg)' : 'transparent',
                borderBottom: centerTab === t ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.12s'
              }}>
                {t === 'timeline' ? <Clock size={13} /> : <BarChart2 size={13} />}
                {t === 'timeline' ? 'Timeline' : 'Analytics'}
              </button>
            ))}

            {/* Active filter chips */}
            <div style={{ display: 'flex', gap: 5, padding: '0 8px', overflow: 'hidden' }}>
              {filter.author    && <Chip label={`👤 ${filter.author}`}    onRemove={() => setFilter(f => ({ ...f, author: undefined }))} />}
              {filter.branch    && <Chip label={`🌿 ${filter.branch}`}    onRemove={() => setFilter(f => ({ ...f, branch: undefined }))} />}
              {filter.file      && <Chip label={`📁 ${filter.file}`}      onRemove={() => setFilter(f => ({ ...f, file: undefined }))} />}
              {filter.date_from && <Chip label={`≥ ${filter.date_from.split('T')[0]}`} onRemove={() => setFilter(f => ({ ...f, date_from: undefined }))} />}
              {filter.date_to   && <Chip label={`≤ ${filter.date_to.split('T')[0]}`}   onRemove={() => setFilter(f => ({ ...f, date_to: undefined }))} />}
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {centerTab === 'timeline' && (
              <div style={{ height: '100%', overflowY: 'auto', padding: '0 10px' }}>
                {/* No repo */}
                {!activeRepo && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--txt-3)' }}>
                    <span style={{ fontSize: 40 }}>⏱</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>No repository</span>
                    <button className="btn btn-primary" onClick={() => setScreen('onboarding')}><Plus size={13} /> Add one</button>
                  </div>
                )}
                {/* Waiting for first sync */}
                {activeRepo && commits.length === 0 && !commitsLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 14, color: 'var(--txt-3)', textAlign: 'center' }}>
                    <span style={{ fontSize: 40 }}>🔄</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>Waiting for commits</span>
                    <span style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 280 }}>
                      {syncing
                        ? 'Repository is being indexed — commits appear automatically.'
                        : 'No commits yet. Try syncing or check your repo URL.'}
                    </span>
                    {!syncing && (
                      <button className="btn btn-ghost" onClick={handleSync}><RefreshCw size={13} /> Sync now</button>
                    )}
                  </div>
                )}
                {/* Timeline */}
                {activeRepo && (commits.length > 0 || commitsLoading) && (
                  <>
                    <CommitTimeline
                      commits={commits}
                      selectedHash={selectedCommit?.hash}
                      onSelect={setSelectedCommit}
                      loading={commitsLoading}
                    />
                    {commits.length > 0 && total > commits.length && (
                      <div style={{ textAlign: 'center', padding: '10px 0 14px', fontSize: 11, color: 'var(--txt-3)' }}>
                        Showing {commits.length.toLocaleString()} of {total.toLocaleString()} — raise the limit in Filters
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {centerTab === 'charts' && activeRepo && (
              <div style={{ height: '100%', overflow: 'hidden' }}>
                <Charts
                  repoId={activeRepo.id}
                  onFilterAuthor={author => { setFilter(f => ({ ...f, author })); setCenterTab('timeline') }}
                />
              </div>
            )}
          </div>
        </main>

        {/* Right: commit detail */}
        {selectedCommit && activeRepo ? (
          <aside style={{ width: 380, flexShrink: 0, borderLeft: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <CommitDetail
              commit={selectedCommit}
              repoId={activeRepo.id}
              apiToken={apiToken}
              onClose={() => setSelectedCommit(null)}
              onSwitched={(hash, mode) => addToast({ type: 'success', message: `⏱ ${mode} → ${hash.slice(0, 7)}` })}
            />
          </aside>
        ) : activeRepo ? (
          /* Mini analytics rail when no commit selected */
          <aside style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-1)' }}>
            <Charts
              repoId={activeRepo.id}
              onFilterAuthor={author => { setFilter(f => ({ ...f, author })); setCenterTab('timeline') }}
            />
          </aside>
        ) : null}
      </div>

      {/* ── Settings drawer ── */}
      {settingsOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 360, background: 'var(--bg-1)', borderLeft: '1px solid var(--border)', overflowY: 'auto' }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Settings</span>
              <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)' }}><X size={16} /></button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* SSH key path reminder */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 8 }}>
                  <Key size={11} /> SSH Key Path
                </label>
                <input
                  className="input" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  placeholder="~/.ssh/id_rsa  or  /Users/you/.ssh/id_rsa"
                  value={sshKeyPath}
                  onChange={e => setSshKeyPath(e.target.value)}
                />
                <p style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 5, lineHeight: 1.55 }}>
                  Enter the path <strong>as it appears on your machine</strong> — your <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>~/.ssh/</code> is mounted into the container automatically.
                </p>
              </div>

              {/* GitHub token */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 8 }}>
                  <Key size={11} /> GitHub Token <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10, letterSpacing: 0 }}>(optional, for force-push)</span>
                </label>
                <input
                  className="input" type="password"
                  placeholder="gh_xxxxxxxxxxxxxxxxxxxx"
                  value={apiToken}
                  onChange={e => setApiToken(e.target.value)}
                />
                <p style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 5, lineHeight: 1.5 }}>
                  Needed for force-push to remote. Never stored to disk.
                </p>
              </div>

              {/* Repos list */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 8 }}>
                  Repositories
                </label>
                {repos.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', marginBottom: 6, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
                    <GitBranch size={12} color="var(--accent)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{r.owner}/{r.name}</div>
                      {r.last_synced && <div style={{ fontSize: 10, color: 'var(--txt-3)' }}>Synced {new Date(r.last_synced).toLocaleString()}</div>}
                    </div>
                    <button className="btn btn-danger" style={{ padding: '3px 7px' }} onClick={() => handleDeleteRepo(r.id)}><Trash2 size={11} /></button>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setSettingsOpen(false); setScreen('onboarding') }}>
                  <Plus size={13} /> Add Repository
                </button>
              </div>

              {/* Quick help */}
              <div style={{ padding: 14, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                  <BookOpen size={13} color="var(--accent-2)" /> Quick guide
                </div>
                {[
                  ['Click any commit', 'Opens detail + file tree on the right'],
                  ['Hash pill', 'Click to copy full SHA'],
                  ['Tree tab', 'Browse full file tree — collapse/expand, click to view file content'],
                  ['Diff tab', 'Unified diff vs parent commit'],
                  ['Travel button', 'Checkout / Branch / Reset / Force-push to any commit'],
                  ['Analytics pie', 'Click an author to filter the timeline'],
                ].map(([k, v]) => (
                  <div key={k} style={{ fontSize: 11, display: 'flex', gap: 7, marginBottom: 5 }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>›</span>
                    <span><b style={{ color: 'var(--txt)' }}>{k}</b> <span style={{ color: 'var(--txt-3)' }}>— {v}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

// ── Tiny shared components ────────────────────────────────────────────────────
function Hdr({ children, title, onClick, disabled }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      title={title} onClick={onClick} disabled={disabled}
      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--txt-3)', display: 'flex', padding: '6px 8px', opacity: disabled ? 0.4 : 1, transition: 'all 0.12s' }}
      onMouseEnter={e => { if (!disabled) { const b = e.currentTarget; b.style.color = 'var(--txt)'; b.style.borderColor = 'var(--border-hi)' } }}
      onMouseLeave={e => { const b = e.currentTarget; b.style.color = 'var(--txt-3)'; b.style.borderColor = 'var(--border)' }}
    >{children}</button>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'rgba(110,231,255,0.08)', border: '1px solid rgba(110,231,255,0.2)', borderRadius: 100, fontSize: 11, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
      {label}
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex', padding: 0 }}><X size={10} /></button>
    </span>
  )
}
