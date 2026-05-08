// LogFeed.tsx — Scrolling robot log panel
import { useRef, useEffect } from 'react';

export type LogLevel = 'INFO' | 'OK' | 'WARN' | 'ERR';

export interface LogEntry {
  time: string;
  level: LogLevel;
  msg: string;
}

export interface LogFeedProps {
  entries: LogEntry[];
  maxHeight?: string | number;
  onClear?: () => void;
}

const LOG_COLORS: Record<LogLevel, string> = {
  INFO: 'var(--color-cyan)',
  OK:   'var(--color-green)',
  WARN: 'var(--color-amber)',
  ERR:  'var(--color-red)',
};

export default function LogFeed({ entries, maxHeight, onClear }: LogFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current?.parentElement) {
      bottomRef.current.parentElement.scrollTop =
        bottomRef.current.parentElement.scrollHeight;
    }
  }, [entries]);

  return (
    <div className="ds-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="ds-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          <span className="ds-card-label">Log Feed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-disabled)' }}>
            {entries.length} lines
          </span>
          {onClear && entries.length > 0 && (
            <button
              className="ds-btn ghost sm"
              onClick={onClear}
              title="Clear logs"
              style={{ fontSize: 10, padding: '1px 6px' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div
        className="scroll-y"
        style={{
          flex: 1,
          padding: '8px 12px',
          maxHeight: maxHeight ?? '100%',
          overflowY: 'auto',
          minHeight: 0,
        }}
      >
        {entries.length === 0 && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--color-text-disabled)', fontStyle: 'italic',
            paddingTop: 4,
          }}>
            Waiting for commands…
          </div>
        )}
        {entries.map((entry, i) => (
          <div
            key={i}
            style={{
              display: 'flex', gap: 10, alignItems: 'baseline',
              fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7,
              animation: 'slide-in-up 150ms ease',
            }}
          >
            <span style={{ color: 'var(--color-text-disabled)', minWidth: 55, flexShrink: 0 }}>
              {entry.time}
            </span>
            <span style={{
              color: LOG_COLORS[entry.level] ?? 'var(--color-text-tertiary)',
              minWidth: 36, flexShrink: 0, fontWeight: 600,
            }}>
              {entry.level}
            </span>
            <span style={{ color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
              {entry.msg}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
