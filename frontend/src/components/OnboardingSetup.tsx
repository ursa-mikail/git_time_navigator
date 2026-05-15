import { useState } from 'react'
import { Github, Key, ArrowRight, Loader2, CheckCircle, Lock, Terminal } from 'lucide-react'
import { repoApi } from '../lib/api'
import type { Repository } from '../types'

interface Props {
  onRepoAdded: (repo: Repository, token: string, sshKeyPath: string) => void
}

type AuthMethod = 'ssh' | 'token' | 'public'

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

export function OnboardingSetup({ onRepoAdded }: Props) {
  const [url,            setUrl]            = useState('')
  const [authMethod,     setAuthMethod]     = useState<AuthMethod>('ssh')
  const [sshKeyPath,     setSshKeyPath]     = useState('~/.ssh/id_ed25519')
  const [sshPassphrase,  setSshPassphrase]  = useState('')
  const [apiToken,       setApiToken]       = useState('')
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')
  const [step,           setStep]           = useState<1 | 2>(1)

  const handleConnect = async () => {
    if (!url.trim()) return
    // Strip trailing slashes/whitespace before sending
    const cleanURL = url.trim().replace(/\/+$/, '').replace(/\.git$/, '')
    setLoading(true)
    setError('')
    try {
      const repo = await repoApi.clone(
        cleanURL,
        authMethod === 'token' ? apiToken : undefined,
        authMethod === 'ssh' ? sshKeyPath : undefined,
        sshPassphrase
      )
      onRepoAdded(repo, apiToken, sshKeyPath)
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || 'Connection failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
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
        backgroundSize: '40px 40px', opacity: 0.25
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 500 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg,rgba(110,231,255,0.18),rgba(167,139,250,0.18))',
            border: '1px solid var(--border-hi)', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, marginBottom: 14
          }}>⏱</div>
          <div style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em', marginBottom: 8 }}>
            Git Time Navigator
          </div>
          <div style={{ color: 'var(--txt-3)', fontSize: 13, lineHeight: 1.6 }}>
            Connect a repository to start exploring its history
          </div>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          {/* Step indicator */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[1, 2].map(s => (
              <div key={s} onClick={() => s < step || (s === 1) ? setStep(s as 1|2) : null}
                style={{
                  flex: 1, padding: '11px 0', textAlign: 'center', fontSize: 12,
                  fontWeight: step === s ? 700 : 400,
                  color: step === s ? 'var(--accent)' : step > s ? 'var(--accent-3)' : 'var(--txt-3)',
                  borderBottom: step === s ? '2px solid var(--accent)' : '2px solid transparent',
                  background: step === s ? 'rgba(110,231,255,0.04)' : 'transparent',
                  cursor: s < step ? 'pointer' : 'default', transition: 'all 0.15s'
                }}>
                {step > s && <CheckCircle size={12} style={{ display: 'inline', marginRight: 5 }} />}
                {s === 1 ? '1 · Repository URL' : '2 · Authentication'}
              </div>
            ))}
          </div>

          <div style={{ padding: 24 }}>
            {/* ── Step 1: URL ── */}
            {step === 1 && (
              <div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 7 }}>
                    Repository URL
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Github size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
                    <input className="input" style={{ paddingLeft: 36 }}
                      placeholder="https://github.com/owner/repo  or  git@github.com:owner/repo"
                      value={url} onChange={e => setUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && url && setStep(2)}
                    />
                  </div>
                </div>

                {/* Hint: SSH vs HTTPS */}
                <div style={{ padding: '9px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--txt-3)', lineHeight: 1.6, marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span><span style={{ color: 'var(--accent)' }}>HTTPS:</span> https://github.com/owner/repo</span>
                    <span><span style={{ color: 'var(--accent-2)' }}>SSH:</span> git@github.com:owner/repo</span>
                  </div>
                  <div style={{ marginTop: 4 }}>Public repos work without auth. Private repos need SSH key or token.</div>
                </div>

                {/* Examples */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: 'var(--txt-3)', marginBottom: 6 }}>Quick examples:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {EXAMPLES.map(ex => (
                      <button key={ex} onClick={() => { setUrl(ex); setStep(2) }} style={{
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
                {/* Auth method tabs */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 8 }}>
                    Authentication method
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([
                      { id: 'public' as AuthMethod,  label: '🌐 Public', desc: 'No auth needed' },
                      { id: 'ssh'    as AuthMethod,  label: '🔑 SSH Key', desc: 'Recommended' },
                      { id: 'token'  as AuthMethod,  label: '🔒 Token', desc: 'HTTPS only' },
                    ]).map(m => (
                      <button key={m.id} onClick={() => setAuthMethod(m.id)} style={{
                        flex: 1, padding: '9px 6px', borderRadius: 6,
                        border: '1px solid',
                        borderColor: authMethod === m.id ? 'var(--accent)' : 'var(--border)',
                        background: authMethod === m.id ? 'rgba(110,231,255,0.07)' : 'var(--bg-2)',
                        cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                        color: authMethod === m.id ? 'var(--accent)' : 'var(--txt-3)',
                        textAlign: 'center', transition: 'all 0.12s'
                      }}>
                        <div>{m.label}</div>
                        <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, color: authMethod === m.id ? 'var(--txt-2)' : 'var(--txt-3)' }}>{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Public */}
                {authMethod === 'public' && (
                  <div style={{ padding: '10px 12px', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 6, fontSize: 12, color: 'var(--accent-3)', marginBottom: 16 }}>
                    <CheckCircle size={13} style={{ display: 'inline', marginRight: 6 }} />
                    No authentication needed for public repositories.
                  </div>
                )}

                {/* SSH Key */}
                {authMethod === 'ssh' && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ padding: '10px 12px', background: 'rgba(110,231,255,0.06)', border: '1px solid rgba(110,231,255,0.18)', borderRadius: 6, fontSize: 11, color: 'var(--txt-2)', lineHeight: 1.7, marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>How it works</div>
                      Your host <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 3 }}>~/.ssh/</code> folder is automatically mounted into the container — just enter your key path <strong>as it appears on your machine</strong>.
                      <div style={{ marginTop: 6, color: 'var(--txt-3)' }}>
                        e.g. <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>/Users/chanfamily/.ssh/id_rsa</code> or <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>~/.ssh/id_rsa</code>
                      </div>
                    </div>

                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 6 }}>
                      Private key path (on your machine)
                    </label>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <Key size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
                      <input className="input" style={{ paddingLeft: 34, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                        value={sshKeyPath} onChange={e => setSshKeyPath(e.target.value)}
                        placeholder="~/.ssh/id_rsa"
                      />
                    </div>

                    {/* Common key shortcuts */}
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                      {DEFAULT_SSH_PATHS.map(p => (
                        <button key={p} onClick={() => setSshKeyPath(p)} style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 9px',
                          background: sshKeyPath === p ? 'rgba(110,231,255,0.12)' : 'var(--bg-3)',
                          border: sshKeyPath === p ? '1px solid var(--accent)' : '1px solid var(--border)',
                          borderRadius: 4, color: sshKeyPath === p ? 'var(--accent)' : 'var(--txt-3)',
                          cursor: 'pointer'
                        }}>{p}</button>
                      ))}
                    </div>

                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 6 }}>
                      Passphrase <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>(leave blank if key has none)</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
                      <input className="input" type="password" style={{ paddingLeft: 34 }}
                        placeholder="passphrase (optional)"
                        value={sshPassphrase} onChange={e => setSshPassphrase(e.target.value)}
                      />
                    </div>

                    {/* Tip: how to check your key */}
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 5 }}>
                      <div style={{ fontSize: 10, color: 'var(--txt-3)', marginBottom: 4 }}>To check your key path in terminal:</div>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-2)' }}>
                        ssh-add -l -E sha256
                      </code>
                    </div>
                  </div>
                )}

                {/* Token */}
                {authMethod === 'token' && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ padding: '9px 12px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 6, fontSize: 11, color: 'var(--txt-2)', lineHeight: 1.6, marginBottom: 12 }}>
                      HTTPS only. Generate at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens. Grant <strong>Contents: Read</strong> scope.
                    </div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt-3)', marginBottom: 6 }}>
                      GitHub Token
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Key size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-3)', pointerEvents: 'none' }} />
                      <input className="input" type="password" style={{ paddingLeft: 34 }}
                        placeholder="ghp_xxxxxxxxxxxx  or  github_pat_..."
                        value={apiToken} onChange={e => setApiToken(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleConnect()}
                      />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--txt-3)', marginTop: 5 }}>
                      Stored in memory only — never written to disk or database.
                    </div>
                  </div>
                )}

                {error && (
                  <div style={{ padding: '9px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 6, fontSize: 12, color: 'var(--danger)', marginBottom: 14, lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => { setStep(1); setError('') }}>
                    Back
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={handleConnect}
                    disabled={loading || !url.trim() || (authMethod === 'token' && !apiToken) || (authMethod === 'ssh' && !sshKeyPath)}>
                    {loading
                      ? <><Loader2 size={14} className="spin" /> Connecting…</>
                      : <>Launch <ArrowRight size={14} /></>
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: 'var(--txt-3)' }}>
          Git Time Navigator · runs entirely locally · no data leaves your machine
        </div>
      </div>
    </div>
  )
}
