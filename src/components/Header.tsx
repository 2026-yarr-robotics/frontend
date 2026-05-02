// Header.tsx — YARR Robotics Dashboard top navigation bar

interface TaskBadgeProps {
  status: 'idle' | 'planning' | 'executing' | 'complete' | 'error';
}

function TaskBadge({ status }: TaskBadgeProps) {
  const configs: Record<string, { label: string; dotClass: string; textColor: string; bg: string; border: string }> = {
    idle:      { label: 'Idle',      dotClass: 'idle',      textColor: 'var(--color-text-tertiary)', bg: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-default)' },
    planning:  { label: 'Planning',  dotClass: 'planning',  textColor: 'var(--color-amber)',         bg: 'oklch(72% 0.18 55 / 0.12)',  border: '1px solid oklch(72% 0.18 55 / 0.3)' },
    executing: { label: 'Executing', dotClass: 'executing', textColor: 'var(--color-cyan)',          bg: 'oklch(75% 0.18 200 / 0.12)', border: '1px solid oklch(75% 0.18 200 / 0.3)' },
    complete:  { label: 'Complete',  dotClass: 'live',      textColor: 'var(--color-green)',         bg: 'oklch(68% 0.18 145 / 0.12)', border: '1px solid oklch(68% 0.18 145 / 0.3)' },
    error:     { label: 'Error',     dotClass: 'error',     textColor: 'var(--color-red)',           bg: 'oklch(62% 0.20 25 / 0.12)',  border: '1px solid oklch(62% 0.20 25 / 0.3)' },
  };
  const c = configs[status] ?? configs['idle'];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 'var(--radius-sm)',
      background: c.bg, border: c.border,
      fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
      letterSpacing: '0.06em', color: c.textColor,
    }}>
      <span className={`status-dot ${c.dotClass}`} />
      {c.label}
    </div>
  );
}

export interface HeaderProps {
  rosConnected: boolean;
  taskStatus: 'idle' | 'planning' | 'executing' | 'complete' | 'error';
  isRunning: boolean;
  onToggleSidebar: () => void;
  onAbort: () => void;
}

export default function Header({ rosConnected, taskStatus, isRunning, onToggleSidebar, onAbort }: HeaderProps) {
  return (
    <header className="dashboard-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          className="ds-btn ghost icon-only"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          style={{ padding: '6px', marginRight: 4 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--color-cyan)', letterSpacing: '0.05em' }}>
            YARR
          </span>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 400, fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '0.02em' }}>
            Robotics
          </span>
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--color-border-default)' }} />
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 400 }}>
          Cup Stack Dashboard
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TaskBadge status={taskStatus} />

        {isRunning && (
          <button className="ds-btn danger sm" onClick={onAbort}>
            Abort
          </button>
        )}

        {/* ROS connection pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 'var(--radius-full)',
          border: '1px solid var(--color-border-default)',
          background: 'var(--color-bg-surface-2)',
        }}>
          <span className={`status-dot ${rosConnected ? 'live' : 'error'}`} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: rosConnected ? 'var(--color-green)' : 'var(--color-red)',
          }}>
            {rosConnected ? '192.168.1.100' : 'Disconnected'}
          </span>
        </div>

        {/* Settings */}
        <button className="ds-btn ghost icon-only" title="Settings">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
