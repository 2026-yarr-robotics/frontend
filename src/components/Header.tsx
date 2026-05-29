import { useState, useRef, useEffect } from 'react';

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
  wsStatus: 'connecting' | 'live' | 'lost';
  rosConnected: boolean;
  taskStatus: 'idle' | 'planning' | 'executing' | 'complete' | 'error';
  isRunning: boolean;
  bringupActive: boolean;
  robotOnline: boolean;
  robotIp: string;
  baseUrl: string;
  rightPanelOpen: boolean;
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
  onAbort: () => void;
  onToggleBringup: () => void;
  onChangeRobotIp: (ip: string) => void;
  onChangeBaseUrl: (url: string) => void;
}

export default function Header({
  wsStatus,
  rosConnected,
  taskStatus,
  isRunning,
  bringupActive,
  robotOnline,
  robotIp,
  baseUrl,
  rightPanelOpen,
  onToggleSidebar,
  onToggleRightPanel,
  onAbort,
  onToggleBringup,
  onChangeRobotIp,
  onChangeBaseUrl,
}: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [ipDraft, setIpDraft] = useState(robotIp);
  const [baseUrlDraft, setBaseUrlDraft] = useState(baseUrl);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Keep drafts in sync when props change externally
  useEffect(() => { setIpDraft(robotIp); }, [robotIp]);
  useEffect(() => { setBaseUrlDraft(baseUrl); }, [baseUrl]);

  // Close settings panel on outside click
  useEffect(() => {
    if (!showSettings) return;
    function onOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [showSettings]);

  function commitIp() {
    const trimmed = ipDraft.trim();
    if (trimmed) onChangeRobotIp(trimmed);
  }

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TaskBadge status={taskStatus} />

        {isRunning && (
          <button className="ds-btn danger sm" onClick={onAbort}>
            Abort
          </button>
        )}

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'var(--color-border-default)' }} />

        {/* Bringup toggle */}
        {bringupActive ? (
          <button
            className="ds-btn danger sm"
            onClick={onToggleBringup}
            disabled={!rosConnected}
            title="Stop bringup"
          >
            ■ Stop Bringup
          </button>
        ) : robotOnline ? (
          <button
            className="ds-btn danger sm"
            onClick={onToggleBringup}
            disabled={!rosConnected}
            title="Bringup running externally (started outside the dashboard) — click to stop"
          >
            <span className="status-dot live" style={{ marginRight: 5 }} />
            ■ Stop Bringup
          </button>
        ) : (
          <button
            className="ds-btn secondary sm"
            onClick={onToggleBringup}
            disabled={!rosConnected}
            title={`Start bringup (${robotIp})`}
          >
            <span style={{ opacity: 0.6, marginRight: 4, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{robotIp}</span>▷ Bringup
          </button>
        )}

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'var(--color-border-default)' }} />

        {/* ROS connection pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 'var(--radius-full)',
          border: '1px solid var(--color-border-default)',
          background: 'var(--color-bg-surface-2)',
        }}>
          <span className={`status-dot ${wsStatus === 'live' ? 'live' : wsStatus === 'connecting' ? 'planning' : 'error'}`} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: wsStatus === 'live'
              ? 'var(--color-green)'
              : wsStatus === 'connecting'
                ? 'var(--color-text-secondary)'
                : 'var(--color-red)',
          }}>
            {wsStatus === 'live' ? 'Connected' : wsStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
          </span>
        </div>

        {/* Right panel toggle */}
        <button
          className="ds-btn ghost icon-only"
          onClick={onToggleRightPanel}
          title={rightPanelOpen ? 'Hide log panel' : 'Show log panel'}
          style={rightPanelOpen ? {} : { opacity: 0.5 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </button>

        {/* Settings button + popover */}
        <div ref={settingsRef} style={{ position: 'relative' }}>
          <button
            className={`ds-btn ghost icon-only ${showSettings ? 'primary' : ''}`}
            onClick={() => setShowSettings(v => !v)}
            title="Settings"
            style={showSettings ? {
              background: 'oklch(75% 0.18 200 / 0.15)',
              border: '1px solid oklch(75% 0.18 200 / 0.4)',
            } : {}}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {showSettings && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 6,
              background: 'var(--color-bg-surface-1)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-overlay)',
              padding: '12px 14px',
              minWidth: 240,
              zIndex: 100,
            }}>
              <div style={{
                fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.1em', color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase', marginBottom: 10,
              }}>
                Settings
              </div>

              {/* API Base URL */}
              <div style={{ marginBottom: 10 }}>
                <label style={{
                  display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11,
                  color: 'var(--color-text-secondary)', marginBottom: 4,
                }}>
                  API Base URL
                </label>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  {[
                    { label: 'yarr-api', url: 'https://yarr-api.simplyimg.com' },
                    { label: 'yarr-api-24', url: 'https://yarr-api-24.simplyimg.com' },
                    { label: 'yarr-api-31', url: 'https://yarr-api-31.simplyimg.com' },
                  ].map(({ label, url }) => {
                    const active = baseUrlDraft === url;
                    return (
                      <button
                        key={url}
                        onClick={() => { onChangeBaseUrl(url); setShowSettings(false); }}
                        style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                          padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                          border: active
                            ? '1px solid oklch(75% 0.18 200 / 0.6)'
                            : '1px solid var(--color-border-default)',
                          background: active
                            ? 'oklch(75% 0.18 200 / 0.15)'
                            : 'var(--color-bg-surface-2)',
                          color: active ? 'var(--color-cyan)' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={baseUrlDraft}
                    onChange={e => setBaseUrlDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        onChangeBaseUrl(baseUrlDraft.trim());
                        setShowSettings(false);
                      }
                    }}
                    placeholder="http://localhost:8000"
                    style={{
                      flex: 1,
                      background: 'var(--color-bg-surface-2)',
                      border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '5px 8px',
                      fontFamily: 'var(--font-mono)', fontSize: 12,
                      color: 'var(--color-text-primary)',
                      outline: 'none',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--color-cyan)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--color-border-default)'; }}
                  />
                  <button
                    className="ds-btn primary sm"
                    onClick={() => { onChangeBaseUrl(baseUrlDraft.trim()); setShowSettings(false); }}
                    disabled={!baseUrlDraft.trim()}
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Robot IP */}
              <div style={{ marginBottom: 10 }}>
                <label style={{
                  display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11,
                  color: 'var(--color-text-secondary)', marginBottom: 4,
                }}>
                  Robot IP
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={ipDraft}
                    onChange={e => setIpDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { commitIp(); setShowSettings(false); } }}
                    placeholder="192.168.1.100"
                    disabled={bringupActive || robotOnline}
                    style={{
                      flex: 1,
                      background: 'var(--color-bg-surface-2)',
                      border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '5px 8px',
                      fontFamily: 'var(--font-mono)', fontSize: 12,
                      color: 'var(--color-text-primary)',
                      outline: 'none',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--color-cyan)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--color-border-default)'; }}
                  />
                  <button
                    className="ds-btn primary sm"
                    onClick={() => { commitIp(); setShowSettings(false); }}
                    disabled={bringupActive || !ipDraft.trim()}
                  >
                    Apply
                  </button>
                </div>
                {(bringupActive || robotOnline) && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                    color: 'var(--color-text-disabled)', marginTop: 3, display: 'block' }}>
                    {bringupActive ? 'Stop bringup to change IP' : 'Robot online — stop bringup to change IP'}
                  </span>
                )}
              </div>

              <div style={{
                borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8,
                fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-disabled)',
              }}>
                Robot: {robotIp}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
