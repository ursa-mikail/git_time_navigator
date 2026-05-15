import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { TrendingUp, Users, FileText } from 'lucide-react'
import { chartApi } from '../lib/api'
import type { ChartData } from '../types'

interface Props {
  repoId: number
  onFilterAuthor?: (author: string) => void
}

const COLORS = ['#6ee7ff','#a78bfa','#34d399','#fbbf24','#f472b6','#fb923c','#60a5fa','#e879f9']

const CTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border-hi)', padding: '7px 11px', borderRadius: 6, fontSize: 12 }}>
      <div style={{ color: 'var(--txt-3)', marginBottom: 3 }}>{label}</div>
      <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{payload[0]?.value ?? 0} commits</div>
    </div>
  )
}

export function Charts({ repoId, onFilterAuthor }: Props) {
  const [freq,     setFreq]     = useState<ChartData[]>([])
  const [authors,  setAuthors]  = useState<ChartData[]>([])
  const [hotspots, setHotspots] = useState<ChartData[]>([])
  const [tab,      setTab]      = useState<'freq' | 'authors' | 'hotspots'>('freq')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!repoId) return
    setLoading(true)
    Promise.all([
      chartApi.frequency(repoId).catch(() => []),
      chartApi.authors(repoId).catch(() => []),
      chartApi.hotspots(repoId).catch(() => []),
    ]).then(([f, a, h]) => {
      setFreq(Array.isArray(f) ? f : [])
      setAuthors(Array.isArray(a) ? a : [])
      setHotspots(Array.isArray(h) ? h : [])
    }).finally(() => setLoading(false))
  }, [repoId])

  const tabs = [
    { id: 'freq'     as const, label: 'Activity', icon: <TrendingUp size={12} /> },
    { id: 'authors'  as const, label: 'Authors',  icon: <Users size={12} /> },
    { id: 'hotspots' as const, label: 'Files',    icon: <FileText size={12} /> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '8px 4px', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: tab === t.id ? 700 : 400,
            background: tab === t.id ? 'var(--bg-2)' : 'transparent',
            color: tab === t.id ? 'var(--accent)' : 'var(--txt-3)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.12s'
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: 10, minHeight: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-3)', fontSize: 12 }}>
            Loading analytics…
          </div>
        ) : (
          <>
            {tab === 'freq' && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--txt-3)', marginBottom: 8 }}>Commits / day (last 90 days)</div>
                {freq.length === 0
                  ? <Empty label="No data yet" />
                  : (
                    <ResponsiveContainer width="100%" height={170}>
                      <BarChart data={freq} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                        <XAxis dataKey="label" tick={{ fill: 'var(--txt-3)', fontSize: 9 }} tickLine={false} interval={Math.floor(freq.length / 5)} />
                        <YAxis tick={{ fill: 'var(--txt-3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CTip />} cursor={{ fill: 'rgba(110,231,255,0.04)' }} />
                        <Bar dataKey="count" fill="var(--accent)" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }
              </div>
            )}

            {tab === 'authors' && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--txt-3)', marginBottom: 8 }}>
                  By author — <span style={{ color: 'var(--accent-2)' }}>click to filter</span>
                </div>
                {authors.length === 0
                  ? <Empty label="No data yet" />
                  : (
                    <ResponsiveContainer width="100%" height={170}>
                      <PieChart>
                        <Pie data={authors.slice(0, 8)} dataKey="count" nameKey="label"
                          cx="50%" cy="50%" outerRadius={60}
                          onClick={(d: any) => onFilterAuthor?.(d.label)}
                          style={{ cursor: 'pointer' }}>
                          {authors.slice(0, 8).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [`${v} commits`]}
                          contentStyle={{ background: 'var(--bg-3)', border: '1px solid var(--border-hi)', borderRadius: 6, fontSize: 11 }} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: 'var(--txt-2)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )
                }
              </div>
            )}

            {tab === 'hotspots' && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--txt-3)', marginBottom: 8 }}>Most changed files</div>
                {hotspots.length === 0
                  ? <Empty label="No data yet" />
                  : (
                    <ResponsiveContainer width="100%" height={170}>
                      <BarChart data={hotspots.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fill: 'var(--txt-3)', fontSize: 9 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="label" tick={{ fill: 'var(--txt-2)', fontSize: 9 }}
                          tickLine={false} width={90}
                          tickFormatter={(v: string) => v.length > 13 ? '…' + v.slice(-12) : v} />
                        <Tooltip content={<CTip />} cursor={{ fill: 'rgba(110,231,255,0.04)' }} />
                        <Bar dataKey="count" fill="var(--accent-2)" radius={[0, 2, 2, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--txt-3)', padding: '24px 0', fontSize: 12 }}>{label}</div>
  )
}
