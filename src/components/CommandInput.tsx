// CommandInput.tsx — Natural language command panel
import { useState, useRef } from 'react';
import { getBaseUrl } from '../api';

export interface CommandInputProps {
  onSend: (cmd: string) => void;
  disabled?: boolean;
}

export default function CommandInput({ onSend, disabled = false }: CommandInputProps) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const docsUrl = `${getBaseUrl()}/api/robot/docs`;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {disabled && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-disabled)' }}>
              task running…
            </span>
          )}
          <button
            className="ds-btn ghost sm"
            onClick={() => setShowHelp(h => !h)}
            aria-expanded={showHelp}
            title="Command 사용법 / API 문서"
            style={{ fontSize: 10, padding: '2px 8px' }}
          >
            {showHelp ? '× Close' : '? Help'}
          </button>
        </div>
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Help panel — pick usage + Swagger UI */}
        {showHelp && (
          <div style={{
            background: 'var(--color-bg-surface-2)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
            fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5,
            color: 'var(--color-text-secondary)',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11, color: 'var(--color-text-primary)' }}>
              Pick — 컵 한 개 집기
            </div>
            <div style={{ color: 'var(--color-text-tertiary)' }}>
              좌표계 <strong>base_link</strong>, 단위 <strong>m</strong>. X·Y 는 컵 중앙, Z 는 컵 <strong>윗면</strong> 기준.
            </div>

            <div style={{ marginTop: 4, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              사용법
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <li>
                <code style={{ color: 'var(--color-cyan)' }}>/pick</code>
                {'  '}— 현재 EE xy 위치에서 <code>--cup 1</code>
              </li>
              <li>
                <code style={{ color: 'var(--color-cyan)' }}>/pick N</code>
                {'  '}— 현재 EE xy 위치에서 nested 컵 N 개
              </li>
              <li>
                <code style={{ color: 'var(--color-cyan)' }}>pick -x X -y Y -z Z</code>
                {'  '}— Z 를 명시 (컵 윗면 중앙)
              </li>
              <li>
                <code style={{ color: 'var(--color-cyan)' }}>pick -x X -y Y --cup N</code>
                {'  '}— nested 컵 N 개 → Z 는 <strong>ROS 2 가 자동 계산</strong>
              </li>
              <li>
                <code style={{ color: 'var(--color-cyan)' }}>pick -x X -y Y</code>
                {'  '}— <code>--cup 1</code> 과 동일 (가장 간단한 형태)
              </li>
              <li>
                <code style={{ color: 'var(--color-cyan)' }}>pick X Y Z</code>
                {'  '}— positional, Z 명시
              </li>
              <li>
                <code style={{ color: 'var(--color-cyan)' }}>pick X Y</code>
                {'  '}— positional, <code>--cup 1</code> 과 동일
              </li>
            </ul>

            <div style={{ marginTop: 4, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              예시
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--color-text-tertiary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <li><code style={{ color: 'var(--color-cyan)' }}>/pick</code> — 현재 EE xy, 1 컵</li>
              <li><code style={{ color: 'var(--color-cyan)' }}>/pick 2</code> — 현재 EE xy, 2 컵 nested</li>
              <li><code style={{ color: 'var(--color-cyan)' }}>pick -x 0.45 -y -0.12 -z 0.05</code> — 명시 Z</li>
              <li><code style={{ color: 'var(--color-cyan)' }}>pick -x 0.45 -y -0.12 --cup 6</code> — 6 컵 스택 상단</li>
              <li><code style={{ color: 'var(--color-cyan)' }}>pick -x 0.45 -y -0.12</code> — 1 컵 (기본)</li>
              <li><code style={{ color: 'var(--color-cyan)' }}>pick 0.45 -0.12 0.05</code> — positional, Z 명시</li>
              <li><code style={{ color: 'var(--color-cyan)' }}>pick 0.45 -0.12</code> — positional, 1 컵</li>
            </ul>

            <div style={{ marginTop: 4, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              참고
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--color-text-tertiary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <li><code>-z</code> 와 <code>--cup</code> 동시 지정 시 <code>-z</code> 우선</li>
              <li><code>--cup</code> 의 Z 계산은 <code>cup_stack.skills.config</code> (ROS 2) 가 담당</li>
              <li>로봇이 online 일 때만 실행 (offline 이면 경고만 표시)</li>
              <li><kbd>↑</kbd>/<kbd>↓</kbd> 로 명령 히스토리 탐색</li>
            </ul>
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginTop: 4, color: 'var(--color-cyan)', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              API 문서 · Swagger UI (/api/robot/docs) ↗
            </a>
          </div>
        )}

        {/* Input row */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            id="command-input"
            value={value}
            onChange={e => { setValue(e.target.value); setHistIdx(-1); }}
            onKeyDown={handleKey}
            disabled={disabled}
            placeholder="see ? Help"
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
      </div>
    </div>
  );
}
