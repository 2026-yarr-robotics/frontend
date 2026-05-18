import { useState, useEffect, useRef } from 'react';
import { getWorkspaceLimits, moveRobot, gripperControl, type WorkspaceLimits, type EePosition } from '../api';

interface ManualControlProps {
  disabled?: boolean;
  eePosition?: EePosition | null;
  onMoveStart?: () => void;
  onMoveEnd?: () => void;
}

interface Position {
  x: number;
  y: number;
  z: number;
}

const DEFAULT_LIMITS: WorkspaceLimits = {
  x_min: -0.3, x_max: 0.3,
  y_min: -0.3, y_max: 0.3,
  z_min: 0.1,  z_max: 0.7,
  grid_spacing: 0.05,
};

const STEP_OPTIONS = [0.005, 0.01, 0.05, 0.1] as const;
type StepOption = typeof STEP_OPTIONS[number];
const LARGE_MOVE_MM = 50;

function fmtM(v: number) { return v.toFixed(3); }
function fmtDelta(d: number) {
  const mm = d * 1000;
  return (mm >= 0 ? '+' : '') + mm.toFixed(0) + 'mm';
}
function deltaColor(d: number) {
  const abs = Math.abs(d) * 1000;
  if (abs < 10) return 'var(--color-green)';
  if (abs < LARGE_MOVE_MM) return 'var(--color-amber)';
  return 'var(--color-red)';
}

export default function ManualControl({
  disabled = false,
  eePosition,
  onMoveStart,
  onMoveEnd,
}: ManualControlProps) {
  const [limits, setLimits] = useState<WorkspaceLimits | null>(null);
  const [target, setTarget] = useState<Position>({ x: 0, y: 0, z: 0.4 });
  const [moving, setMoving] = useState(false);
  const [gripperState, setGripperState] = useState<'open' | 'closed' | null>(null);
  const [gripperMoving, setGripperMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [editing, setEditing] = useState<'x' | 'y' | 'z' | null>(null);
  const [editVal, setEditVal] = useState('');
  const [step, setStep] = useState<StepOption>(0.01);
  const [confirmHome, setConfirmHome] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const initializedRef = useRef(false);

  useEffect(() => {
    getWorkspaceLimits().then(setLimits).catch(e => setError(`Limits: ${e.message}`));
  }, []);

  const effectiveLimits = limits ?? (devMode ? DEFAULT_LIMITS : null);

  useEffect(() => {
    if (!eePosition || initializedRef.current) return;
    initializedRef.current = true;
    setTarget({ x: eePosition.x, y: eePosition.y, z: eePosition.z });
  }, [eePosition]);

  useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

  const isDisabled = moving || (!devMode && disabled);

  const delta = eePosition
    ? { x: target.x - eePosition.x, y: target.y - eePosition.y, z: target.z - eePosition.z }
    : null;

  const maxDeltaMm = delta
    ? Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z)) * 1000
    : 0;
  const isLargeMove = maxDeltaMm > LARGE_MOVE_MM;
  const hasPendingMove = !!delta && maxDeltaMm > 1;

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  async function executeMove(pos: Position) {
    setMoving(true);
    setError(null);
    onMoveStart?.();
    try {
      await moveRobot(pos.x, pos.y, pos.z, 'absolute');
    } catch (e: any) {
      setError(`Move failed: ${e.message}`);
    } finally {
      setMoving(false);
      onMoveEnd?.();
    }
  }

  function handleRelativeMove(axis: 'x' | 'y' | 'z', d: number) {
    if (!effectiveLimits || isDisabled) return;
    const base = eePosition ?? target;
    const next: Position = { ...base };
    next[axis] = clamp(base[axis] + d, effectiveLimits[`${axis}_min`], effectiveLimits[`${axis}_max`]);
    setTarget(next);
    executeMove(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (editing) return;
    const actions: Record<string, () => void> = {
      ArrowUp:    () => handleRelativeMove('y', step),
      ArrowDown:  () => handleRelativeMove('y', -step),
      ArrowLeft:  () => handleRelativeMove('x', -step),
      ArrowRight: () => handleRelativeMove('x', step),
      PageUp:     () => handleRelativeMove('z', step),
      PageDown:   () => handleRelativeMove('z', -step),
    };
    const action = actions[e.key];
    if (action) { e.preventDefault(); action(); }
  }

  function pressHome() {
    if (isDisabled) return;
    if (!confirmHome) {
      setConfirmHome(true);
      confirmTimerRef.current = setTimeout(() => setConfirmHome(false), 2000);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    setConfirmHome(false);
    const home: Position = { x: 0, y: 0, z: 0.4 };
    setTarget(home);
    executeMove(home);
  }

  async function handleGripper(command: 'open' | 'close') {
    if (isDisabled || gripperMoving) return;
    setGripperMoving(true);
    setError(null);
    try {
      await gripperControl(command);
      setGripperState(command === 'open' ? 'open' : 'closed');
    } catch (e: any) {
      setError(`Gripper: ${e.message}`);
    } finally {
      setGripperMoving(false);
    }
  }

  function snapToActual() {
    if (!eePosition) return;
    setTarget({ x: eePosition.x, y: eePosition.y, z: eePosition.z });
  }

  function startEdit(axis: 'x' | 'y' | 'z') {
    if (isDisabled) return;
    setEditing(axis);
    setEditVal(target[axis].toFixed(3));
  }

  function commitEdit() {
    if (!editing || !effectiveLimits) { setEditing(null); return; }
    const v = parseFloat(editVal);
    if (!isNaN(v)) {
      setTarget(prev => ({
        ...prev,
        [editing]: clamp(v, effectiveLimits[`${editing}_min`], effectiveLimits[`${editing}_max`]),
      }));
    }
    setEditing(null);
  }

  function handleEditKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditing(null);
  }

  const headerRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        className="ds-btn ghost sm"
        onClick={() => setDevMode(!devMode)}
        style={{
          fontSize: 9,
          border: devMode ? '1px solid var(--color-cyan)' : '1px solid var(--color-border-default)',
          color: devMode ? 'var(--color-cyan)' : 'var(--color-text-tertiary)',
        }}
        title="Developer mode"
      >
        DEV
      </button>
      <span className={`status-dot ${moving ? 'live' : 'idle'}`} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
        color: moving ? 'var(--color-green)' : 'var(--color-text-disabled)' }}>
        {moving ? 'MOVING' : 'IDLE'}
      </span>
    </div>
  );

  if (!effectiveLimits) {
    return (
      <div className="ds-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="ds-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
            </svg>
            <span className="ds-card-label">Manual Control</span>
          </div>
          {headerRight}
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-disabled)' }}>
            {error || 'Loading workspace limits…'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ds-card"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, outline: 'none' }}
    >
      <div className="ds-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
          </svg>
          <span className="ds-card-label">Manual Control</span>
        </div>
        {headerRight}
      </div>

      <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>

        {/* ── Position: Actual | Target (editable) | Delta ── */}
        <div>
          <div style={{
            display: 'grid', gridTemplateColumns: '14px 1fr 1fr 48px',
            gap: '2px 6px', marginBottom: 5, alignItems: 'center',
          }}>
            <div />
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 600,
              color: 'var(--color-text-tertiary)', letterSpacing: '0.08em' }}>ACTUAL</div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 600,
              color: 'var(--color-cyan)', letterSpacing: '0.08em' }}>
              TARGET{' '}
              <span style={{ color: 'var(--color-text-disabled)', fontWeight: 400 }}>click to edit</span>
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 600,
              color: 'var(--color-text-tertiary)', letterSpacing: '0.08em' }}>Δ</div>
          </div>

          {(['x', 'y', 'z'] as const).map(axis => (
            <div key={axis} style={{
              display: 'grid', gridTemplateColumns: '14px 1fr 1fr 48px',
              gap: '2px 6px', alignItems: 'center', marginBottom: 4,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                {axis.toUpperCase()}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: eePosition ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                background: 'var(--color-bg-surface-2)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)', padding: '3px 6px',
              }}>
                {eePosition ? fmtM(eePosition[axis]) : '—'}
              </span>

              {editing === axis ? (
                <input
                  autoFocus
                  type="number"
                  step={0.001}
                  min={effectiveLimits[`${axis}_min`]}
                  max={effectiveLimits[`${axis}_max`]}
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKey}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: 'var(--color-cyan)',
                    background: 'var(--color-bg-surface-2)',
                    border: '1px solid var(--color-cyan)',
                    borderRadius: 'var(--radius-sm)', padding: '3px 6px',
                    outline: 'none', width: '100%',
                  }}
                />
              ) : (
                <span
                  onClick={() => startEdit(axis)}
                  title="Click to edit target coordinate"
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: 'var(--color-cyan)',
                    background: 'var(--color-bg-surface-2)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)', padding: '3px 6px',
                    cursor: isDisabled ? 'default' : 'text',
                  }}
                  onMouseEnter={e => { if (!isDisabled) (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-cyan)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-subtle)'; }}
                >
                  {fmtM(target[axis])}
                </span>
              )}

              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, textAlign: 'right',
                color: delta ? deltaColor(delta[axis]) : 'var(--color-text-disabled)',
              }}>
                {delta ? fmtDelta(delta[axis]) : '—'}
              </span>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <button
              className="ds-btn ghost sm"
              onClick={snapToActual}
              disabled={!eePosition}
              style={{ fontSize: 9, padding: '3px 8px', flexShrink: 0 }}
              title="Reset target to actual robot position"
            >
              ↺ Reset to Actual
            </button>
            <div style={{ flex: 1 }} />
            {isLargeMove && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-red)' }}>
                ⚠ {maxDeltaMm.toFixed(0)}mm
              </span>
            )}
            <button
              className={`ds-btn sm ${isLargeMove ? 'danger' : 'primary'}`}
              onClick={() => executeMove(target)}
              disabled={isDisabled || !hasPendingMove}
              style={{ flexShrink: 0 }}
              title="Move to target coordinates"
            >
              Move to Target →
            </button>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--color-border-subtle)' }} />

        {/* ── Jog: step from actual position ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
              color: 'var(--color-text-secondary)' }}>
              Jog
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              {STEP_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setStep(s)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)', border: '1px solid',
                    cursor: 'pointer',
                    background: step === s ? 'var(--color-cyan)' : 'transparent',
                    borderColor: step === s ? 'var(--color-cyan)' : 'var(--color-border-default)',
                    color: step === s ? 'var(--color-bg-base)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {parseFloat((s * 100).toFixed(1))}cm
                </button>
              ))}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--color-text-disabled)', marginLeft: 'auto' }}>
              ↑↓←→ · PgUp/PgDn(Z)
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4, maxWidth: 160, margin: '0 auto' }}>
            <div />
            <button className="ds-btn ghost sm" onClick={() => handleRelativeMove('y', step)}
              disabled={isDisabled} style={{ width: '100%', justifyContent: 'center' }}>↑</button>
            <div />

            <button className="ds-btn ghost sm" onClick={() => handleRelativeMove('x', -step)}
              disabled={isDisabled} style={{ width: '100%', justifyContent: 'center' }}>←</button>
            <button
              className={`ds-btn sm ${confirmHome ? 'danger' : 'primary'}`}
              onClick={pressHome}
              disabled={isDisabled}
              title={confirmHome ? 'Press again to confirm home move' : 'HOME (0, 0, 0.4m) — press twice to confirm'}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {confirmHome ? 'Sure?' : '⌂'}
            </button>
            <button className="ds-btn ghost sm" onClick={() => handleRelativeMove('x', step)}
              disabled={isDisabled} style={{ width: '100%', justifyContent: 'center' }}>→</button>

            <div />
            <button className="ds-btn ghost sm" onClick={() => handleRelativeMove('y', -step)}
              disabled={isDisabled} style={{ width: '100%', justifyContent: 'center' }}>↓</button>
            <div />

            {/* Z row — −Z left, +Z right */}
            <button className="ds-btn ghost sm" onClick={() => handleRelativeMove('z', -step)}
              disabled={isDisabled} title="-Z 5mm"
              style={{ width: '100%', justifyContent: 'center', fontSize: 10 }}>−Z</button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--color-text-tertiary)' }}>
                {eePosition ? fmtM(eePosition.z) : '—'}m
              </span>
            </div>
            <button className="ds-btn ghost sm" onClick={() => handleRelativeMove('z', step)}
              disabled={isDisabled} title="+Z 5mm"
              style={{ width: '100%', justifyContent: 'center', fontSize: 10 }}>+Z</button>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--color-border-subtle)' }} />

        {/* ── Gripper ── */}
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
            color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            Gripper
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className={`ds-btn sm ${gripperState === 'open' ? 'primary' : 'secondary'}`}
              onClick={() => handleGripper('open')}
              disabled={isDisabled || gripperMoving}
              style={{ flex: 1 }}
            >
              {gripperMoving && gripperState !== 'closed' ? '…' : '↔ Open'}
            </button>
            <button
              className={`ds-btn sm ${gripperState === 'closed' ? 'primary' : 'secondary'}`}
              onClick={() => handleGripper('close')}
              disabled={isDisabled || gripperMoving}
              style={{ flex: 1 }}
            >
              {gripperMoving && gripperState !== 'open' ? '…' : '↕ Close'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span className={`status-dot ${
                gripperMoving ? 'planning' : gripperState === 'open' ? 'live' : gripperState === 'closed' ? 'error' : 'idle'
              }`} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--color-text-disabled)' }}>
                {gripperMoving ? 'MOVING' : gripperState ?? '—'}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '6px 8px',
            background: 'oklch(55% 0.18 25 / 0.1)',
            border: '1px solid oklch(55% 0.18 25 / 0.3)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'oklch(55% 0.18 25)',
          }}>
            {error}
          </div>
        )}
        {devMode && (
          <div style={{
            padding: '5px 8px',
            background: 'oklch(75% 0.18 200 / 0.08)',
            border: '1px solid oklch(75% 0.18 200 / 0.25)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'oklch(75% 0.18 200)',
          }}>
            ⚙ Developer mode{!limits ? ' · using default limits' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
