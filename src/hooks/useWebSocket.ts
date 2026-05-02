import { useEffect, useRef, useCallback } from 'react';

type MessageHandler = (data: MessageEvent) => void;

const RECONNECT_DELAY_MS = 2000;

export function wsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

export function useWebSocket(path: string, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(wsUrl(path));
    ws.onmessage = (e) => onMessageRef.current(e);
    ws.onclose = () => {
      wsRef.current = null;
      if (mountedRef.current) {
        timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { wsRef, reconnect: connect };
}

export function useJsonWebSocket<T>(path: string, onMessage: (data: T) => void) {
  const handler = useCallback(
    (e: MessageEvent) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch { /* ignore parse errors */ }
    },
    [onMessage],
  );
  return useWebSocket(path, handler);
}
