import { useEffect, useRef, useCallback } from 'react'
import { wsConnect } from '../lib/api'

type Handler = (msg: { type: string; payload: Record<string, unknown> }) => void

export function useWebSocket(onMessage: Handler) {
  const wsRef = useRef<WebSocket | null>(null)
  const handlerRef = useRef(onMessage)
  handlerRef.current = onMessage

  useEffect(() => {
    const connect = () => {
      wsRef.current = wsConnect(msg => handlerRef.current(msg))
      wsRef.current.onclose = () => {
        setTimeout(connect, 2000) // reconnect
      }
    }
    connect()
    return () => wsRef.current?.close()
  }, [])
}
