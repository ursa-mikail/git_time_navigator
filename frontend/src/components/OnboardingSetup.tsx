import { useState, useEffect } from 'react'
import { Github, Key, ArrowRight, Loader2, CheckCircle, Lock, Terminal, AlertCircle, Wifi, WifiOff } from 'lucide-react'
import { repoApi } from '../lib/api'
import type { Repository } from '../types'
import axios from 'axios'

interface Props {
  onRepoAdded: (repo: Repository, token: string, sshKeyPath: string) => void
}

type AuthMethod = 'ssh' | 'token' | 'public'
type BackendStatus = 'checking' | 'ok' | 'down'

const EXAMPLES = [
  'https://github.com/facebook/react',
  'git@github.com:torvalds/linux',
  'https://github.com/golang/go',
]

const DEFAULT_SSH_PATHS = [
  '~/.ssh/id_ed25519',
  '~/.ssh/id_rsa',
  '~/.ssh/id_ecdsa',
]

const BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8080'

async function checkBackend(): Promise<boolean> {
  try {
    await axios.get(`${BASE}/health`, { timeout: 4000 })
    return true
  } catch {
    return false
  }
}

// Parse axios / fetch errors into a human-readable message
function parseError(e: any): string {
  // Axios network error (backend not reachable)
  if (e.code === 'ERR_NETWORK' || e.message === 'Network Error' || !e.response) {
    return `Cannot reach backend at ${BASE}. Make sure Docker is running and the backend container is up:\n\n  ./scripts/up.sh\n\nThen check: docker ps`
  }
  // Backend returned an error body
  const msg = e.response?.data?.error || e.response?.data?.message || e.message
  if (!msg) return 'Unknown error'

  // Make SSH errors friendlier
  if (msg.includes('no SSH key found') || msg.includes('no such file')) {
    return `SSH key not found inside the container.\n\nYour ~/.ssh/ is mounted automatically. Enter the path as it appears on your Mac:\n  ~/.ssh/id_rsa\n  /Users/you/.ssh/id_rsa\n\nThen ensure the key exists: ls -la ~/.ssh/`
  }
  if (msg.includes('invalid SSH key') || msg.includes('wrong passphrase')) {
    return `SSH key could not be loaded — check your passphrase or key format.\n\n${msg}`
  }
  if (msg.includes('repository not found')) {
    return `Repository not found: "${msg.split('"')[1] || ''}".\n\nCheck the URL has no trailing slash and the repo exists.`
  }
  if (msg.includes('invalid auth method')) {
    return `Authentication failed. For SSH URLs (git@github.com:...) use the SSH Key method. For HTTPS URLs use Token or Public.`
  }
  return msg
}

export function OnboardingSetup({ onRepoAdded }: Props) {
  const [url,           setUrl]          = useState('')
  const [authMethod,    setAuthMethod]   = useState<AuthMethod>('ssh')
  const [sshKeyPath,    setSshKeyPath]   = useState('~/.ssh/id_rsa')
  const [sshPassphrase, setSshPassphrase] = useState('')
  const [apiToken,      setApiToken]     = useState('')
  const [loading,       setLoading]      = useState(false)
  const [error,         setError]        = useState('')
  const [step,          setStep]         = useState<1 | 2>(1)
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking')

  // Check backend health on mount and retry every 5s if down
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const check = async () => {
      const ok = await checkBackend()
      setBackendStatus(ok ? 'ok' : 'down')
      if (!ok) timer = setTimeout(check, 5000)
    }
    check()
    return () => clearTimeout(timer)
  }, [])

  const handleConnect = async () => {
    if (!url.trim()) return
    const cleanURL = url.trim().replace(/\/+$/, '').replace(/\.git$/, '')
    setLoading(true)
    setError('')
    try {
      const repo = await repoApi.clone(
        cleanURL,
        authMethod === 'token' ? apiToken : undefined,
        authMethod === 'ssh'   ? sshKeyPath : undefined,
        authMethod === 'ssh'   ? sshPassphrase : undefined,
      )
      onRepoAdded(repo, apiToken, sshKeyPath)
    } catch (e: any) {
      setError(parseError(e))
    } finally {
      setLoading(false)
    }
  }

  // Auto-detect: SSH URL → switch to SSH auth
  const handleURLChange = (v: string) => {
    setUrl(v)
    if (v.startsWith('git@') && authMethod === 'public') setAuthMethod('ssh')
    if (v.startsWith('https://') && authMethod === 'ssh' && !v.includes('private')) setAuthMethod('public')
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: 'var(--bg)', position: 'relative'
    }}>
      {/* Grid bg */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)',
        backgroundSize: '40px 40px', opacity: 0.22
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 500 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏱</div>
          <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', marginBottom: 6 }}>
            Git Time Navigator
          </div>
          <div style={{ color: 'var(--txt-3)', fontSize: 13 }}>
            Connect a repo to browse and time-travel its history
          </div>
        </div>

        {/* Backend status banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 14,
          borderRadius: 6, fontSize: 12,
          background: backendStatus === 'ok' ? 'rgba(52,211,153,0.07)' : backendStatus === 'down' ? 'rgba(248,113,113,0.08)' : 'rgba(110,231,255,0.06)',
          border: `1px solid ${backendStatus === 'ok' ? 'rgba(52,211,153,0.25)' : backendStatus === 'down' ? 'rgba(248,113,113,0.25)' : 'rgba(110,231,255,0.2)'}`,
          color: backendStatus === 'ok' ? 'var(--accent-3)' : backendStatus === 'down' ? 'var(--danger)' : 'var(--txt-3)',
        }}>
          {backendStatus === 'checking' && <Loader2 size={13} className="spin" />}
          {backendStatus === 'ok'       && <Wifi size={13} />}
          {backendStatus === 'down'     && <WifiOff size={13} />}
          {backendStatus === 'checking' && 'Connecting to backend…'}
          {backendStatus === 'ok'       && `Backend ready · ${BASE}`}
          {backendStatus === 'down'     && (
            <span>
              Backend unreachable at <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{BASE}</code>
              {' — run '}
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>./scripts/up.sh</code>
            </span>
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          {/* Step tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              { n: 1, label: '1 · Repository URL' },
              { n: 2, label: '2 · Authentication' },
            ].map(({ n, label }) => (
              <div key={n}
                onClick={() => n < step && setStep(n as 1 | 2)}
                style={{
                  flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 12,
                  fontWeight: step === n ? 700 : 400,
                  color: step === n ? 'var(--accent)' : step > n ? 'var(--accent-3)' : 'var(--txt-3)',
                  borderBottom: step === n ? '2px solid var(--accent)' : '2px solid transparent',
                  background: step === n ? 'rgba(110,231,255,0.04)' : 'transparent',
                  cursor: n < step ? 'pointer' : 'default', transition: 'all 0.12s',
                }}>
                {step > n && <CheckCircle size={11} style={{ display: 'inline', marginRight: 4 }} />}
                {label}
              </div>
            ))}
          </div>

          <div style={{ padding: 22 }}>

            {/* ── Step 1: URL ── */}
            {step === 1 && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 7 }}>
                  Repository URL
                </label>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Github size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
                  <input className="input" style={{ paddingLeft: 32 }}
                    placeholder="https://github.com/owner/repo  or  git@github.com:owner/repo"
                    value={url} onChange={e => handleURLChange(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && url && setStep(2)}
                    autoFocus
                  />
                </div>

                <div style={{ padding: '8px 11px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 5, fontSize: 11, color: 'var(--txt-3)', lineHeight: 1.6, marginBottom: 12 }}>
                  <span style={{ color: 'var(--accent)' }}>HTTPS:</span> https://github.com/owner/repo
                  <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>
                  <span style={{ color: 'var(--accent-2)' }}>SSH:</span> git@github.com:owner/repo
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--txt-3)', marginBottom: 6 }}>Quick examples:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {EXAMPLES.map(ex => (
                      <button key={ex} onClick={() => { handleURLChange(ex); setStep(2) }} style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 10px',
                        background: 'var(--bg-3)', border: '1px solid var(--border)',
                        borderRadius: 100, color: 'var(--txt-2)', cursor: 'pointer'
                      }}>
                        {ex.replace('https://github.com/', '').replace('git@github.com:', '')}
                      </button>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setStep(2)} disabled={!url.trim()}>
                  Next <ArrowRight size={14} />
                </button>
              </div>
            )}

            {/* ── Step 2: Auth ── */}
            {step === 2 && (
              <div>
                {/* Auth method selector */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 8 }}>
                    Authentication method
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([
                      { id: 'public' as AuthMethod, label: '🌐 Public', sub: 'No auth' },
                      { id: 'ssh'    as AuthMethod, label: '🔑 SSH Key', sub: 'Recommended' },
                      { id: 'token'  as AuthMethod, label: '🔒 Token',   sub: 'HTTPS only' },
                    ]).map(m => (
                      <button key={m.id} onClick={() => setAuthMethod(m.id)} style={{
                        flex: 1, padding: '8px 6px', borderRadius: 6,
                        border: `1px solid ${authMethod === m.id ? 'var(--accent)' : 'var(--border)'}`,
                        background: authMethod === m.id ? 'rgba(110,231,255,0.07)' : 'var(--bg-2)',
                        cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                        color: authMethod === m.id ? 'var(--accent)' : 'var(--txt-3)',
                        textAlign: 'center', transition: 'all 0.12s'
                      }}>
                        <div>{m.label}</div>
                        <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>{m.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Public */}
                {authMethod === 'public' && (
                  <div style={{ padding: '10px 12px', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 6, fontSize: 12, color: 'var(--accent-3)', marginBottom: 16 }}>
                    <CheckCircle size={13} style={{ display: 'inline', marginRight: 6 }} />
                    No authentication needed — works for any public GitHub repository.
                  </div>
                )}

                {/* SSH */}
                {authMethod === 'ssh' && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ padding: '9px 12px', background: 'rgba(110,231,255,0.06)', border: '1px solid rgba(110,231,255,0.18)', borderRadius: 6, fontSize: 11, color: 'var(--txt-2)', lineHeight: 1.7, marginBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                        <Terminal size={12} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                        <div>
                          Enter the key path <strong>as it appears on your machine</strong>.<br />
                          Your <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-3)', padding: '0 3px', borderRadius: 2 }}>~/.ssh/</code> folder is mounted into the container automatically.<br />
                          <span style={{ color: 'var(--txt-3)', fontSize: 10 }}>Run <code style={{ fontFamily: 'var(--font-mono)' }}>ssh-add -l -E sha256</code> to see your loaded keys.</span>
                        </div>
                      </div>
                    </div>

                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 6 }}>
                      Private key path (on your machine)
                    </label>
                    <div style={{ position: 'relative', marginBottom: 6 }}>
                      <Key size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
                      <input className="input" style={{ paddingLeft: 30, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                        value={sshKeyPath} onChange={e => setSshKeyPath(e.target.value)}
                        placeholder="~/.ssh/id_rsa"
                      />
                    </div>

                    {/* Common key shortcuts */}
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                      {DEFAULT_SSH_PATHS.map(p => (
                        <button key={p} onClick={() => setSshKeyPath(p)} style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 9px',
                          background: sshKeyPath === p ? 'rgba(110,231,255,0.12)' : 'var(--bg-3)',
                          border: sshKeyPath === p ? '1px solid var(--accent)' : '1px solid var(--border)',
                          borderRadius: 4, color: sshKeyPath === p ? 'var(--accent)' : 'var(--txt-3)', cursor: 'pointer'
                        }}>{p}</button>
                      ))}
                    </div>

                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 6 }}>
                      Passphrase <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>(leave blank if none)</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
                      <input className="input" type="password" style={{ paddingLeft: 30 }}
                        placeholder="passphrase (optional)"
                        value={sshPassphrase} onChange={e => setSshPassphrase(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleConnect()}
                      />
                    </div>
                  </div>
                )}

                {/* Token */}
                {authMethod === 'token' && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ padding: '8px 11px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 6, fontSize: 11, color: 'var(--txt-2)', lineHeight: 1.6, marginBottom: 10 }}>
                      HTTPS only. Generate at GitHub → Settings → Developer settings → Personal access tokens. Grant <strong>Contents: Read</strong>.
                    </div>
                    <div style={{ position: 'relative' }}>
                      <Key size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
                      <input className="input" type="password" style={{ paddingLeft: 30 }}
                        placeholder="ghp_xxxx  or  github_pat_xxxx"
                        value={apiToken} onChange={e => setApiToken(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleConnect()}
                      />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--txt-3)', marginTop: 5 }}>Held in memory only — never stored.</div>
                  </div>
                )}

                {/* Error box */}
                {error && (
                  <div style={{
                    display: 'flex', gap: 9, padding: '10px 12px', marginBottom: 14,
                    background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.25)',
                    borderRadius: 6
                  }}>
                    <AlertCircle size={14} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <pre style={{
                      fontSize: 11, color: 'var(--danger)', margin: 0,
                      fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6
                    }}>{error}</pre>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => { setStep(1); setError('') }}>Back</button>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={handleConnect}
                    disabled={
                      loading ||
                      backendStatus !== 'ok' ||
                      !url.trim() ||
                      (authMethod === 'token' && !apiToken) ||
                      (authMethod === 'ssh' && !sshKeyPath)
                    }>
                    {loading
                      ? <><Loader2 size={13} className="spin" /> Connecting…</>
                      : backendStatus !== 'ok'
                        ? <><WifiOff size={13} /> Backend not ready</>
                        : <>Launch <ArrowRight size={14} /></>
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--txt-3)' }}>
          Runs entirely locally · no data leaves your machine
        </div>
      </div>
    </div>
  )
}
