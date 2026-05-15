import { useState, useEffect, useCallback } from 'react'
import { treeApi } from '../lib/api'
import type { TreeNode } from '../types'
import {
  Folder, FolderOpen, FileText, FileCode, FileImage,
  ChevronRight, Loader, AlertCircle, X, Copy, Check
} from 'lucide-react'

interface Props {
  repoId: number
  hash: string
  shortHash: string
}

// File extension → icon color
const EXT_COLORS: Record<string, string> = {
  ts: '#3b82f6', tsx: '#3b82f6', js: '#eab308', jsx: '#eab308',
  py: '#10b981', go: '#06b6d4', rs: '#f97316', java: '#f59e0b',
  css: '#a78bfa', scss: '#ec4899', html: '#f87171', json: '#34d399',
  md: '#94a3b8', sql: '#60a5fa', sh: '#6ee7ff', yaml: '#fbbf24',
  yml: '#fbbf24', toml: '#fb923c', env: '#34d399', txt: '#9ca3af',
}

function getExtColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return EXT_COLORS[ext] || 'var(--txt-3)'
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return FileImage
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'cs', 'rb', 'php', 'sh'].includes(ext)) return FileCode
  return FileText
}

interface NodeProps {
  node: TreeNode
  depth: number
  onFileClick: (node: TreeNode) => void
  selectedPath?: string
  defaultOpen?: boolean
}

function TreeNodeRow({ node, depth, onFileClick, selectedPath, defaultOpen = false }: NodeProps) {
  const [open, setOpen] = useState(defaultOpen || depth === 0)
  const isSelected = node.path === selectedPath
  const IconComp = node.type === 'file' ? getFileIcon(node.name) : undefined

  const indent = depth * 14

  if (node.type === 'dir') {
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 5,
            padding: `4px 8px 4px ${8 + indent}px`,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--txt-2)', textAlign: 'left', fontSize: 12,
            fontFamily: 'var(--font-mono)',
            transition: 'background 0.1s',
            borderRadius: 3,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-3)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <ChevronRight
            size={12}
            color="var(--txt-3)"
            style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s', flexShrink: 0 }}
          />
          {open
            ? <FolderOpen size={13} color="var(--warn)" style={{ flexShrink: 0 }} />
            : <Folder size={13} color="var(--warn)" style={{ flexShrink: 0 }} />
          }
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name || 'root'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--txt-3)', flexShrink: 0 }}>
            {node.children?.length || 0}
          </span>
        </button>

        {open && node.children && (
          <div>
            {(node.children ?? []).map(child => (
              <TreeNodeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileClick={onFileClick}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File node
  const color = getExtColor(node.name)
  const Icon = IconComp || FileText

  return (
    <button
      onClick={() => onFileClick(node)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 5,
        padding: `3px 8px 3px ${8 + indent}px`,
        background: isSelected ? 'rgba(110,231,255,0.08)' : 'none',
        border: 'none',
        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        cursor: 'pointer', color: 'var(--txt-2)', textAlign: 'left',
        fontSize: 12, fontFamily: 'var(--font-mono)',
        transition: 'background 0.1s',
        borderRadius: '0 3px 3px 0',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-3)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'none' }}
    >
      {/* Spacer for align with dir chevron */}
      <span style={{ width: 12, flexShrink: 0 }} />
      <Icon size={12} color={color} style={{ flexShrink: 0 }} />
      <span style={{
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: node.changed ? 'var(--warn)' : 'var(--txt-2)',
      }}>
        {node.name}
      </span>
      {node.changed && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--warn)', flexShrink: 0,
          boxShadow: '0 0 6px var(--warn)'
        }} />
      )}
      {node.size != null && node.size > 0 && (
        <span style={{ fontSize: 10, color: 'var(--txt-3)', flexShrink: 0 }}>
          {formatBytes(node.size)}
        </span>
      )}
    </button>
  )
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}K`
  return `${(b / 1024 / 1024).toFixed(1)}M`
}

// ── File content viewer ───────────────────────────────────────────────────────

interface ContentViewerProps {
  repoId: number
  hash: string
  node: TreeNode
  onClose: () => void
}

function ContentViewer({ repoId, hash, node, onClose }: ContentViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLoading(true)
    setContent(null)
    treeApi.fileContent(repoId, hash, node.path)
      .then(r => setContent(r.content))
      .catch(() => setContent('[error loading file]'))
      .finally(() => setLoading(false))
  }, [repoId, hash, node.path])

  const copy = () => {
    if (content) {
      navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const ext = node.name.split('.').pop()?.toLowerCase() || ''
  const color = getExtColor(node.name)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)', borderTop: '1px solid var(--border)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flexShrink: 0
      }}>
        <FileCode size={13} color={color} />
        <span className="mono" style={{ flex: 1, fontSize: 12, color: 'var(--txt-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.path}
        </span>
        {node.changed && (
          <span className="badge badge-warn" style={{ fontSize: 9 }}>CHANGED</span>
        )}
        <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex' }}>
          {copied ? <Check size={13} color="var(--accent-3)" /> : <Copy size={13} />}
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex' }}>
          <X size={13} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, gap: 8, color: 'var(--txt-3)', fontSize: 12 }}>
            <Loader size={14} className="spin" /> Loading…
          </div>
        ) : (
          <div className="mono" style={{ fontSize: 11, lineHeight: 1.7, padding: '8px 0' }}>
            {content?.split('\n').map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 0 }}>
                <span style={{
                  minWidth: 40, paddingRight: 12, paddingLeft: 8,
                  color: 'var(--txt-3)', textAlign: 'right',
                  userSelect: 'none', borderRight: '1px solid var(--border)',
                  fontSize: 10, lineHeight: 1.7, flexShrink: 0
                }}>
                  {i + 1}
                </span>
                <span style={{
                  paddingLeft: 12, whiteSpace: 'pre', color: 'var(--txt-2)',
                  flex: 1
                }}>
                  {line || '\u00A0'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main FileTree export ──────────────────────────────────────────────────────

export function FileTree({ repoId, hash, shortHash }: Props) {
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState<TreeNode | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    setSelectedFile(null)
    treeApi.get(repoId, hash)
      .then(setTree)
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false))
  }, [repoId, hash])

  // Count changed files
  const changedCount = useCallback((node: TreeNode | null): number => {
    if (!node) return 0
    if (node.type === 'file') return node.changed ? 1 : 0
    return (node.children || []).reduce((sum, c) => sum + changedCount(c), 0)
  }, [])

  const totalCount = useCallback((node: TreeNode | null): number => {
    if (!node) return 0
    if (node.type === 'file') return 1
    return (node.children || []).reduce((sum, c) => sum + totalCount(c), 0)
  }, [])

  // Filter tree nodes by search
  const filterTree = useCallback((node: TreeNode, q: string): TreeNode | null => {
    if (!q) return node
    const ql = q.toLowerCase()
    if (node.type === 'file') {
      return node.name.toLowerCase().includes(ql) ? node : null
    }
    const children = (node.children || []).map(c => filterTree(c, q)).filter(Boolean) as TreeNode[]
    if (children.length === 0) return null
    return { ...node, children }
  }, [])

  const displayTree = search && tree ? filterTree(tree, search) : tree

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Folder size={14} color="var(--warn)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-2)' }}>
            Tree at <span className="mono" style={{ color: 'var(--accent)' }}>{shortHash}</span>
          </span>
          {!loading && tree && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--txt-3)' }}>
              {totalCount(tree)} files · <span style={{ color: 'var(--warn)' }}>{changedCount(tree)} changed</span>
            </span>
          )}
        </div>
        <input
          style={{
            width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '5px 10px', color: 'var(--txt)',
            fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none'
          }}
          placeholder="Filter files…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
      </div>

      {/* Legend */}
      <div style={{ padding: '5px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14, fontSize: 10, color: 'var(--txt-3)', flexShrink: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', display: 'inline-block' }} />
          Changed in this commit
        </span>
        <span>Click file to preview</span>
      </div>

      {/* Tree */}
      <div style={{ flex: selectedFile ? '0 0 50%' : 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8, color: 'var(--txt-3)', fontSize: 12 }}>
            <Loader size={14} className="spin" /> Building tree…
          </div>
        )}
        {error && (
          <div style={{ padding: 16, display: 'flex', gap: 8, color: 'var(--danger)', fontSize: 12 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
        {!loading && !error && displayTree && (
          <div style={{ padding: '4px 0' }}>
            {(displayTree.children || []).map(child => (
              <TreeNodeRow
                key={child.path}
                node={child}
                depth={0}
                onFileClick={setSelectedFile}
                selectedPath={selectedFile?.path}
                defaultOpen={true}
              />
            ))}
          </div>
        )}
        {!loading && !error && displayTree && displayTree.children?.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--txt-3)', fontSize: 12 }}>
            No files match "{search}"
          </div>
        )}
      </div>

      {/* File content viewer */}
      {selectedFile && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ContentViewer
            repoId={repoId}
            hash={hash}
            node={selectedFile}
            onClose={() => setSelectedFile(null)}
          />
        </div>
      )}
    </div>
  )
}
