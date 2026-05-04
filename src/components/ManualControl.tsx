import { useState, useEffect, useRef } from 'react';
import { getWorkspaceLimits, moveRobot, type WorkspaceLimits, type EePosition } from '../api';

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

const STEP = 0.005;           // 5mm per D-pad press
const LARGE_MOVE_MM = 50;     // warn if any axis delta exceeds this

function roundToGrid(v: number, spacing: number) {
  return Math.round(v / spacing) * spacing;
}

function fmtM(v: number) { return v.toFixed(3); }

function fmtDelta(d: number): string {
  const mm = d * 1000;
  return (mm >= 0 ? '+' : '') + mm.toFixed(0) + 'mm';
}

function deltaColor(d: number): string {
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
  const [gridX, setGridX] = useState(0);
  const [gridY, setGridY] = useState(0);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    getWorkspaceLimits().then(setLimits).catch(e => setError(`Limits: ${e.message}`));
  }, []);

  const effectiveLimits = limits ?? (devMode ? DEFAULT_LIMITS : null);

  // One-time initialization of target from actual EE position when first received
  useEffect(() => {
    if (!eePosition || initializedRef.current) return;
    initializedRef.current = true;
    const pos = { x: eePosition.x, y: eePosition.y, z: eePosition.z };
    setTarget(pos);
    const sp = (effectiveLimits?.grid_spacing) ?? 0.05;
    setGridX(roundToGrid(pos.x, sp));
    setGridY(roundToGrid(pos.y, sp));
  }, [eePosition, effectiveLimits]);

  const isDisabled = moving || (!devMode && disabled);

  // Delta between actual EE position and commanded target
  const delta = eePosition ? {
    x: target.x - eePosition.x,
    y: target.y - eePosition.y,
    z: target.z - eePosition.z,
  } : null;

  const maxDeltaMm = delta
    ? Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z)) * 1000
    : 0;
  const isLargeMove = maxDeltaMm > LARGE_MOVE_MM;

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  async function executeMove(pos: Position) {
    setMoving(true);
    setError(null);
    onMoveStart?.();
    try {
      const res = await moveRobot(pos.x, pos.y, pos.z, 'absolute');
      if (res.position) {
        setTarget({ x: res.position.x, y: res.position.y, z: res.position.z });
      }
    } catch (e: any) {
      setError(`Move failed: ${e.message}`);
    } finally {
      setMoving(false);
      onMoveEnd?.();
    }
  }

  function handleRelativeMove(axis: 'x' | 'y' | 'z', delta: number) {
    if (!effectiveLimits || isDisabled) return;
    const next = { ...target };
    next[axis] = clamp(target[axis] + delta, effectiveLimits[`${axis}_min`], effectiveLimits[`${axis}_max`]);
    setTarget(next);
    executeMove(next);
  }

  function handleGridMove() {
    if (!effectiveLimits || isDisabled) return;
    const next = { x: gridX, y: gridY, z: target.z };
    setTarget(next);
    executeMove(next);
  }

  function handleHome() {
    if (!effectiveLimits || isDisabled) return;
    const home: Position = { x: 0, y: 0, z: 0.4 };
    setTarget(home);
    executeMove(home);
  }

  function snapToActual() {
    if (!eePosition) return;
    const pos = { x: eePosition.x, y: eePosition.y, z: eePosition.z };
    setTarget(pos);
    const sp = effectiveLimits?.grid_spacing ?? 0.05;
    setGridX(roundToGrid(pos.x, sp));
    setGridY(roundToGrid(pos.y, sp));
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
        title="Developer mode: bypass connection check"
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

  const spacing = effectiveLimits.grid_spacing || 0.05;

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

      <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>

        {/* ── Position: Actual vs Target ── */}
        <div>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '16px 1fr 1fr 50px',
            gap: '2px 6px',
            marginBottom: 4,
          }}>
            <div />
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 600,
              color: 'var(--color-text-tertiary)', letterSpacing: '0.08em' }}>
              ACTUAL
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 600,
              color: 'var(--color-cyan)', letterSpacing: '0.08em' }}>
              TARGET
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 600,
              color: 'var(--color-text-tertiary)', letterSpacing: '0.08em' }}>
              DELTA
            </div>
          </div>

          {/* X / Y / Z rows */}
          {(['x', 'y', 'z'] as const).map(axis => (
            <div key={axis} style={{
              display: 'grid',
              gridTemplateColumns: '16px 1fr 1fr 50px',
              gap: '2px 6px',
              alignItems: 'center',
              marginBottom: 3,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                {axis.toUpperCase()}
              </span>
              {/* Actual */}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: eePosition ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                background: 'var(--color-bg-surface-2)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '3px 6px',
              }}>
                {eePosition ? fmtM(eePosition[axis]) : '—'}
              </span>
              {/* Target */}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'var(--color-cyan)',
                background: 'var(--color-bg-surface-2)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '3px 6px',
              }}>
                {fmtM(target[axis])}
              </span>
              {/* Delta */}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: delta ? deltaColor(delta[axis]) : 'var(--color-text-disabled)',
                textAlign: 'right',
              }}>
                {delta ? fmtDelta(delta[axis]) : '—'}
              </span>
            </div>
          ))}

          {/* Large move warning + snap button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            {isLargeMove ? (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--color-red)',
              }}>
                ⚠ {maxDeltaMm.toFixed(0)}mm 이동
              </span>
            ) : <div />}
            <button
              className="ds-btn ghost sm"
              onClick={snapToActual}
              disabled={!eePosition}
              title="타겟을 현재 실제 위치로 초기화"
              style={{ fontSize: 9, padding: '2px 8px' }}
            >
              ↺ 현재 위치로
            </button>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--color-border-subtle)' }} />

        {/* ── XY D-Pad ── */}
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
            color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            XY MOVE (±{STEP * 1000}mm)
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4,
            maxWidth: 160,
            margin: '0 auto',
          }}>
            {/* Row 1: blank · ↑Y · blank */}
            <div />
            <button className="ds-btn ghost sm"
              onClick={() => handleRelativeMove('y', STEP)}
              disabled={isDisabled} title="+Y"
              style={{ width: '100%', justifyContent: 'center' }}>↑</button>
            <div />

            {/* Row 2: ←X · HOME · →X */}
            <button className="ds-btn ghost sm"
              onClick={() => handleRelativeMove('x', -STEP)}
              disabled={isDisabled} title="-X"
              style={{ width: '100%', justifyContent: 'center' }}>←</button>
            <button className="ds-btn primary sm"
              onClick={handleHome}
              disabled={isDisabled} title="HOME (0, 0, 0.4m)"
              style={{ width: '100%', justifyContent: 'center' }}>⌂</button>
            <button className="ds-btn ghost sm"
              onClick={() => handleRelativeMove('x', STEP)}
              disabled={isDisabled} title="+X"
              style={{ width: '100%', justifyContent: 'center' }}>→</button>

            {/* Row 3: blank · ↓Y · blank */}
            <div />
            <button className="ds-btn ghost sm"
              onClick={() => handleRelativeMove('y', -STEP)}
              disabled={isDisabled} title="-Y"
              style={{ width: '100%', justifyContent: 'center' }}>↓</button>
            <div />
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--color-border-subtle)' }} />

        {/* ── Grid Point — absolute XY ── */}
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
            color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            GRID POINT (절대)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {(['x', 'y'] as const).map(axis => (
              <div key={axis} style={{ flex: 1 }}>
                <label style={{
                  display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: 'var(--color-text-tertiary)', marginBottom: 2,
                }}>
                  {axis.toUpperCase()} (m)
                </label>
                <input
                  type="number"
                  step={spacing}
                  min={effectiveLimits[`${axis}_min`]}
                  max={effectiveLimits[`${axis}_max`]}
                  value={axis === 'x' ? gridX : gridY}
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0;
                    if (axis === 'x') setGridX(v); else setGridY(v);
                  }}
                  disabled={isDisabled}
                  style={{
                    width: '100%',
                    background: 'var(--color-bg-surface-2)',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 6px',
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
            ))}
            <button
              className={`ds-btn sm ${isLargeMove ? 'danger' : 'primary'}`}
              onClick={handleGridMove}
              disabled={isDisabled}
              title={isLargeMove ? `⚠ 큰 이동 (${maxDeltaMm.toFixed(0)}mm)` : '이동'}
              style={{ flexShrink: 0 }}
            >
              {isLargeMove ? '⚠ Move' : 'Move'}
            </button>
          </div>
          {/* Show current EE grid position for reference */}
          {eePosition && (
            <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--color-text-tertiary)' }}>
              현재 격자: X={roundToGrid(eePosition.x, spacing).toFixed(3)}
              {' '} Y={roundToGrid(eePosition.y, spacing).toFixed(3)}
            </div>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--color-border-subtle)' }} />

        {/* ── Z Height ── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
              color: 'var(--color-text-secondary)' }}>
              Z HEIGHT (절대)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="ds-btn ghost sm"
                onClick={() => handleRelativeMove('z', STEP)}
                disabled={isDisabled}
                style={{ padding: '3px 8px', fontSize: 10 }}>+Z</button>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--color-cyan)', minWidth: 52, textAlign: 'center',
              }}>
                {fmtM(target.z)}m
              </span>
              <button className="ds-btn ghost sm"
                onClick={() => handleRelativeMove('z', -STEP)}
                disabled={isDisabled}
                style={{ padding: '3px 8px', fontSize: 10 }}>−Z</button>
            </div>
          </div>

          {/* Slider with actual Z marker */}
          <div style={{ position: 'relative' }}>
            <input
              type="range"
              min={effectiveLimits.z_min}
              max={effectiveLimits.z_max}
              step={0.005}
              value={target.z}
              onChange={e => setTarget(prev => ({ ...prev, z: parseFloat(e.target.value) }))}
              onPointerUp={e => {
                const z = parseFloat((e.target as HTMLInputElement).value);
                const next = { ...target, z };
                setTarget(next);
                if (!isDisabled) executeMove(next);
              }}
              disabled={isDisabled}
              style={{ width: '100%', cursor: isDisabled ? 'not-allowed' : 'pointer' }}
            />
            {/* Actual Z marker line */}
            {eePosition && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: `${((eePosition.z - effectiveLimits.z_min) / (effectiveLimits.z_max - effectiveLimits.z_min)) * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 2,
                height: 12,
                background: 'var(--color-green)',
                borderRadius: 1,
                pointerEvents: 'none',
                opacity: 0.8,
              }} title={`실제 Z: ${fmtM(eePosition.z)}m`} />
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              {effectiveLimits.z_min.toFixed(2)}m
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'oklch(72% 0.18 55)', fontStyle: 'italic' }}>
              드래그 후 놓으면 적용
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              {effectiveLimits.z_max.toFixed(2)}m
            </span>
          </div>

          {/* Delta Z badge */}
          {delta && Math.abs(delta.z) > 0.002 && (
            <div style={{
              marginTop: 4, textAlign: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: deltaColor(delta.z),
            }}>
              실제 Z {fmtM(eePosition!.z)}m → 목표 {fmtM(target.z)}m ({fmtDelta(delta.z)})
            </div>
          )}
        </div>

        {/* ── Error / warnings ── */}
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
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            ⚙ Developer mode{!limits ? ' · 기본 한계값 사용 중' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
