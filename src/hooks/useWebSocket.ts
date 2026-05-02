import { useEffect, useRef, useCallback } from 'react';

type MessageHandler = (data: MessageEvent) => void;

export function wsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

export function useWebSocket(path: string, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(wsUrl(path));
    ws.onmessage = (e) => onMessageRef.current(e);
    ws.onclose = () => {
      wsRef.current = null;
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [path]);

  useEffect(() => {
    connect();
    return () => {
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
