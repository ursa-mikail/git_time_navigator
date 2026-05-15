import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Loader, RefreshCw } from 'lucide-react'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'error' | 'loading'
  message: string
}

interface Props {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastStack({ toasts, onDismiss }: Props) {
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 200, pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.type !== 'loading') {
      const timer = setTimeout(() => onDismiss(toast.id), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast.id, toast.type, onDismiss])

  const colors: Record<Toast['type'], string> = {
    info:    'var(--accent)',
    success: 'var(--accent-3)',
    error:   'var(--danger)',
    loading: 'var(--accent-2)',
  }
  const icons: Record<Toast['type'], React.ReactNode> = {
    info:    <RefreshCw size={14} />,
    success: <CheckCircle size={14} />,
    error:   <XCircle size={14} />,
    loading: <Loader size={14} className="spin" />,
  }

  const color = colors[toast.type]

  return (
    <div className="fade-up" style={{
      pointerEvents: 'all',
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px',
      background: 'var(--bg-2)',
      border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 'var(--radius)',
      boxShadow: `0 4px 24px rgba(0,0,0,0.4)`,
      maxWidth: 340, fontSize: 13, color: 'var(--txt)'
    }}>
      <span style={{ color }}>{icons[toast.type]}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
    </div>
  )
}

// Hook
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const add = (t: Omit<Toast, 'id'>): string => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { ...t, id }])
    return id
  }

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const update = (id: string, patch: Partial<Toast>) =>
    setToasts(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))

  return { toasts, add, dismiss, update }
}
