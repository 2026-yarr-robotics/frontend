import { useState, useEffect, useRef } from 'react';
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

export default function ManualControl({ disabled = false, onMoveStart, onMoveEnd }: ManualControlProps) {
  const [limits, setLimits] = useState<WorkspaceLimits | null>(null);
  const [current, setCurrent] = useState<Position>({ x: 0, y: 0, z: 0.4 });
  const [target, setTarget] = useState<Position>({ x: 0, y: 0, z: 0.4 });
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gridX, setGridX] = useState<number>(0);
  const [gridY, setGridY] = useState<number>(0);

  const step = 0.005; // 5mm for relative moves

  useEffect(() => {
    getWorkspaceLimits().then(setLimits).catch(e => setError(`Failed to load limits: ${e.message}`));
  }, []);

  useEffect(() => {
    if (!limits) return;
    const spacing = limits.grid_spacing || 0.05;
    setGridX(Math.round(current.x / spacing) * spacing);
    setGridY(Math.round(current.y / spacing) * spacing);
  }, [current, limits]);

  function handleRelativeMove(axis: 'x' | 'y' | 'z', delta: number) {
    if (!limits || moving || disabled) return;

    const newTarget = { ...target };
    if (axis === 'x') newTarget.x = Math.max(limits.x_min, Math.min(limits.x_max, target.x + delta));
    if (axis === 'y') newTarget.y = Math.max(limits.y_min, Math.min(limits.y_max, target.y + delta));
    if (axis === 'z') newTarget.z = Math.max(limits.z_min, Math.min(limits.z_max, target.z + delta));

    setTarget(newTarget);
    executeMove(newTarget);
  }

  function handleGridMove() {
    if (!limits || moving || disabled) return;
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
    if (!limits || moving || disabled) return;
    const homePos = { x: 0, y: 0, z: 0.4 };
    setTarget(homePos);
    executeMove(homePos);
  }

  function isOutOfBounds(x: number, y: number, z: number): boolean {
    if (!limits) return false;
    return x < limits.x_min || x > limits.x_max ||
           y < limits.y_min || y > limits.y_max ||
           z < limits.z_min || z > limits.z_max;
  }

  if (!limits) {
    return (
      <div className="ds-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-disabled)' }}>
          {error || 'Loading workspace limits...'}
        </span>
      </div>
    );
  }

  const spacing = limits.grid_spacing || 0.05;
  const xGridPoints = Array.from({ length: Math.floor((limits.x_max - limits.x_min) / spacing) + 1 },
    (_, i) => limits.x_min + i * spacing);
  const yGridPoints = Array.from({ length: Math.floor((limits.y_max - limits.y_min) / spacing) + 1 },
    (_, i) => limits.y_min + i * spacing);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`status-dot ${moving ? 'live' : 'idle'}`} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: moving ? 'var(--color-green)' : 'var(--color-text-disabled)' }}>
            {moving ? 'MOVING' : 'IDLE'}
          </span>
        </div>
      </div>

      <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>
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
                  {current[axis as keyof Position].toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* X/Y Relative Controls */}
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            XY POSITION (±{step * 1000}mm)
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
            {/* Y controls */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button className="ds-btn ghost sm" onClick={() => handleRelativeMove('y', step)} disabled={disabled || moving}>
                ↑
              </button>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-tertiary)' }}>Y</div>
              <button className="ds-btn ghost sm" onClick={() => handleRelativeMove('y', -step)} disabled={disabled || moving}>
                ↓
              </button>
            </div>
            {/* X controls */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button className="ds-btn ghost sm" onClick={() => handleRelativeMove('x', step)} disabled={disabled || moving}>
                →
              </button>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-tertiary)' }}>X</div>
              <button className="ds-btn ghost sm" onClick={() => handleRelativeMove('x', -step)} disabled={disabled || moving}>
                ←
              </button>
            </div>
          </div>
        </div>

        {/* Grid Point Selection */}
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            GRID POINT (absolute)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>X</label>
              <select
                value={gridX}
                onChange={e => setGridX(parseFloat(e.target.value))}
                disabled={disabled || moving}
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
              >
                {xGridPoints.map(v => (
                  <option key={v} value={v}>{v.toFixed(3)}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Y</label>
              <select
                value={gridY}
                onChange={e => setGridY(parseFloat(e.target.value))}
                disabled={disabled || moving}
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
              >
                {yGridPoints.map(v => (
                  <option key={v} value={v}>{v.toFixed(3)}</option>
                ))}
              </select>
            </div>
            <button className="ds-btn primary sm" onClick={handleGridMove} disabled={disabled || moving}>
              Move
            </button>
          </div>
        </div>

        {/* Z Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Z HEIGHT (absolute)
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-cyan)' }}>
              {target.z.toFixed(3)}m
            </span>
          </div>
          <input
            type="range"
            min={limits.z_min}
            max={limits.z_max}
            step={0.01}
            value={target.z}
            onChange={e => setTarget(prev => ({ ...prev, z: parseFloat(e.target.value) }))}
            onMouseUp={() => executeMove(target)}
            onTouchEnd={() => executeMove(target)}
            disabled={disabled || moving}
            style={{
              width: '100%',
              cursor: disabled || moving ? 'not-allowed' : 'pointer',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              {limits.z_min.toFixed(2)}m
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              {limits.z_max.toFixed(2)}m
            </span>
          </div>
        </div>

        {/* Home Button */}
        <div style={{ marginTop: 'auto' }}>
          <button className="ds-btn secondary" onClick={handleHome} disabled={disabled || moving} style={{ width: '100%' }}>
            ← Move to HOME (0, 0, 0.4m)
          </button>
        </div>

        {/* Error Message */}
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

        {/* Out of Bounds Warning */}
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
      </div>
    </div>
  );
}
