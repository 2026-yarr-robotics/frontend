import { useState, useEffect } from 'react';
import { getWorkspaceLimits, moveRobot, type WorkspaceLimits } from '../api';

interface ManualControlProps {
  disabled?: boolean;
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

const step = 0.005; // 5mm per relative move

export default function ManualControl({ disabled = false, onMoveStart, onMoveEnd }: ManualControlProps) {
  const [limits, setLimits] = useState<WorkspaceLimits | null>(null);
  const [current, setCurrent] = useState<Position>({ x: 0, y: 0, z: 0.4 });
  const [target, setTarget] = useState<Position>({ x: 0, y: 0, z: 0.4 });
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [gridX, setGridX] = useState<number>(0);
  const [gridY, setGridY] = useState<number>(0);

  useEffect(() => {
    getWorkspaceLimits().then(setLimits).catch(e => setError(`Failed to load limits: ${e.message}`));
  }, []);

  // In dev mode, fall back to hardcoded defaults when limits aren't loaded yet
  const effectiveLimits = limits ?? (devMode ? DEFAULT_LIMITS : null);

  useEffect(() => {
    if (!effectiveLimits) return;
    const spacing = effectiveLimits.grid_spacing || 0.05;
    setGridX(Math.round(current.x / spacing) * spacing);
    setGridY(Math.round(current.y / spacing) * spacing);
  }, [current, effectiveLimits]);

  const isDisabled = moving || (!devMode && disabled);

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function handleRelativeMove(axis: 'x' | 'y' | 'z', delta: number) {
    if (!effectiveLimits || isDisabled) return;
    const newTarget = { ...target };
    if (axis === 'x') newTarget.x = clamp(target.x + delta, effectiveLimits.x_min, effectiveLimits.x_max);
    if (axis === 'y') newTarget.y = clamp(target.y + delta, effectiveLimits.y_min, effectiveLimits.y_max);
    if (axis === 'z') newTarget.z = clamp(target.z + delta, effectiveLimits.z_min, effectiveLimits.z_max);
    setTarget(newTarget);
    executeMove(newTarget);
  }

  function handleGridMove() {
    if (!effectiveLimits || isDisabled) return;
    const newTarget = { ...target, x: gridX, y: gridY };
    setTarget(newTarget);
    executeMove(newTarget);
  }

  async function executeMove(pos: Position) {
    setMoving(true);
    setError(null);
    onMoveStart?.();
    try {
      await moveRobot(pos.x, pos.y, pos.z, 'absolute');
      setCurrent(pos);
    } catch (e: any) {
      setError(`Move failed: ${e.message}`);
    } finally {
      setMoving(false);
      onMoveEnd?.();
    }
  }

  function handleHome() {
    if (!effectiveLimits || isDisabled) return;
    const homePos = { x: 0, y: 0, z: 0.4 };
    setTarget(homePos);
    executeMove(homePos);
  }

  function isOutOfBounds(x: number, y: number, z: number): boolean {
    if (!effectiveLimits) return false;
    return x < effectiveLimits.x_min || x > effectiveLimits.x_max ||
           y < effectiveLimits.y_min || y > effectiveLimits.y_max ||
           z < effectiveLimits.z_min || z > effectiveLimits.z_max;
  }

  const devModeHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        className="ds-btn ghost sm"
        onClick={() => setDevMode(!devMode)}
        style={{
          fontSize: 9,
          border: devMode ? '1px solid var(--color-cyan)' : '1px solid var(--color-border-default)',
          color: devMode ? 'var(--color-cyan)' : 'var(--color-text-tertiary)',
        }}
        title="Developer mode: enable controls without robot connection"
      >
        DEV
      </button>
      <span className={`status-dot ${moving ? 'live' : 'idle'}`} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: moving ? 'var(--color-green)' : 'var(--color-text-disabled)' }}>
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
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v8M8 12h8"/>
            </svg>
            <span className="ds-card-label">Manual Control</span>
          </div>
          {devModeHeader}
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

  // Shared button style for the DPAD grid cells
  const dpadBtn = (label: string, title: string, onClick: () => void) => (
    <button
      className="ds-btn ghost sm"
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      style={{ width: '100%', justifyContent: 'center' }}
    >
      {label}
    </button>
  );

  return (
    <div className="ds-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="ds-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v8M8 12h8"/>
          </svg>
          <span className="ds-card-label">Manual Control</span>
        </div>
        {devModeHeader}
      </div>

      <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>

        {/* Current Position */}
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            CURRENT POSITION (m)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {(['x', 'y', 'z'] as const).map(axis => (
              <div key={axis} style={{
                background: 'var(--color-bg-surface-2)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 8px',
                textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-tertiary)' }}>{axis.toUpperCase()}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-primary)' }}>
                  {current[axis].toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* XY D-Pad — 3×3 grid: 상하좌우 + 가운데 */}
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            XY MOVE (±{step * 1000}mm)
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4,
            maxWidth: 168,
            margin: '0 auto',
          }}>
            {/* Row 1: blank · ↑Y · blank */}
            <div />
            {dpadBtn('↑', 'Forward (+Y)', () => handleRelativeMove('y', step))}
            <div />

            {/* Row 2: ←X · HOME · →X */}
            {dpadBtn('←', 'Left (-X)', () => handleRelativeMove('x', -step))}
            <button
              className="ds-btn primary sm"
              onClick={handleHome}
              disabled={isDisabled}
              title="Move to HOME (0, 0, 0.4m)"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              ⌂
            </button>
            {dpadBtn('→', 'Right (+X)', () => handleRelativeMove('x', step))}

            {/* Row 3: blank · ↓Y · blank */}
            <div />
            {dpadBtn('↓', 'Backward (-Y)', () => handleRelativeMove('y', -step))}
            <div />
          </div>
        </div>

        {/* Grid Point — number inputs */}
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            GRID POINT (absolute)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {(['x', 'y'] as const).map(axis => (
              <div key={axis} style={{ flex: 1 }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>
                  {axis.toUpperCase()} (m)
                </label>
                <input
                  type="number"
                  step={spacing}
                  min={effectiveLimits[`${axis}_min` as keyof WorkspaceLimits] as number}
                  max={effectiveLimits[`${axis}_max` as keyof WorkspaceLimits] as number}
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
                    padding: '4px 8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
            ))}
            <button
              className="ds-btn primary sm"
              onClick={handleGridMove}
              disabled={isDisabled}
              style={{ flexShrink: 0 }}
            >
              Move
            </button>
          </div>
        </div>

        {/* Z Height slider + step buttons */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Z HEIGHT (absolute)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className="ds-btn ghost sm"
                onClick={() => handleRelativeMove('z', step)}
                disabled={isDisabled}
                title="Z up (+5mm)"
                style={{ padding: '3px 8px', fontSize: 10 }}
              >
                +Z
              </button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-cyan)', minWidth: 46, textAlign: 'right' }}>
                {target.z.toFixed(3)}m
              </span>
              <button
                className="ds-btn ghost sm"
                onClick={() => handleRelativeMove('z', -step)}
                disabled={isDisabled}
                title="Z down (-5mm)"
                style={{ padding: '3px 8px', fontSize: 10 }}
              >
                −Z
              </button>
            </div>
          </div>
          <input
            type="range"
            min={effectiveLimits.z_min}
            max={effectiveLimits.z_max}
            step={0.01}
            value={target.z}
            onChange={e => setTarget(prev => ({ ...prev, z: parseFloat(e.target.value) }))}
            onPointerUp={e => {
              const z = parseFloat((e.target as HTMLInputElement).value);
              const newTarget = { ...target, z };
              setTarget(newTarget);
              if (!isDisabled) executeMove(newTarget);
            }}
            disabled={isDisabled}
            style={{ width: '100%', cursor: isDisabled ? 'not-allowed' : 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              {effectiveLimits.z_min.toFixed(2)}m
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(72% 0.18 55)', fontStyle: 'italic' }}>
              드래그 후 놓으면 적용
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              {effectiveLimits.z_max.toFixed(2)}m
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '8px',
            background: 'oklch(55% 0.18 25 / 0.1)',
            border: '1px solid oklch(55% 0.18 25 / 0.3)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'oklch(55% 0.18 25)',
          }}>
            {error}
          </div>
        )}

        {/* Out of bounds */}
        {isOutOfBounds(target.x, target.y, target.z) && (
          <div style={{
            padding: '8px',
            background: 'oklch(72% 0.18 55 / 0.1)',
            border: '1px solid oklch(72% 0.18 55 / 0.3)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'oklch(72% 0.18 55)',
          }}>
            ⚠ Target out of workspace limits
          </div>
        )}

        {/* Dev mode banner */}
        {devMode && (
          <div style={{
            padding: '6px',
            background: 'oklch(75% 0.18 200 / 0.1)',
            border: '1px solid oklch(75% 0.18 200 / 0.3)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'oklch(75% 0.18 200)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>⚙</span>
            <span>Developer mode: connection check bypassed{!limits ? ' · using default limits' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}
