// CommandInput.tsx — Natural language command panel
import { useState, useRef } from 'react';

const SUGGESTIONS: string[] = [
  'Stack cups into pyramid',
  'Unstack pyramid',
  'Move to HOME',
  'Open gripper',
  'Close gripper',
  'Stop',
];

export interface CommandInputProps {
  onSend: (cmd: string) => void;
  disabled?: boolean;
}

export default function CommandInput({ onSend, disabled = false }: CommandInputProps) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(text?: string) {
    const cmd = (text ?? value).trim();
    if (!cmd) return;
    setHistory(h => [cmd, ...h.slice(0, 19)]);
    setHistIdx(-1);
    setValue('');
    onSend(cmd);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      setValue(history[next] ?? '');
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(histIdx - 1, -1);
      setHistIdx(next);
      setValue(next === -1 ? '' : history[next]);
    }
  }

  return (
    <div className="ds-card" style={{ flexShrink: 0 }}>
      <div className="ds-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          <span className="ds-card-label">Command</span>
        </div>
        {disabled && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-disabled)' }}>
            task running…
          </span>
        )}
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Input row */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            id="command-input"
            value={value}
            onChange={e => { setValue(e.target.value); setHistIdx(-1); }}
            onKeyDown={handleKey}
            disabled={disabled}
            placeholder="e.g. Stack the cups into a 3-2-1 pyramid…"
            style={{
              flex: 1,
              background: 'var(--color-bg-surface-2)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--color-text-primary)',
              outline: 'none',
              caretColor: 'var(--color-cyan)',
              transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
            }}
            onFocus={e => {
              e.target.style.borderColor = 'var(--color-cyan)';
              e.target.style.boxShadow = '0 0 0 2px oklch(75% 0.18 200 / 0.15)';
            }}
            onBlur={e => {
              e.target.style.borderColor = 'var(--color-border-default)';
              e.target.style.boxShadow = 'none';
            }}
          />
          <button
            className="ds-btn primary"
            onClick={() => submit()}
            disabled={disabled || !value.trim()}
          >
            Send ↵
          </button>
        </div>

        {/* Suggestion chips */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => submit(s)}
              disabled={disabled}
              style={{
                padding: '3px 9px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-surface-2)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
                transition: 'border-color var(--transition-fast), color var(--transition-fast)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'oklch(75% 0.18 200 / 0.5)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-cyan)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border-default)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-tertiary)';
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
