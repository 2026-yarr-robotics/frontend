// RobotStatus.tsx — Sidebar robot status panel (joints, gripper, task progress)

export type TaskStatus = 'idle' | 'planning' | 'executing' | 'complete' | 'error';

export interface RobotStatusProps {
  joints: number[];
  gripperMm: number;
  taskStatus: TaskStatus;
  cycleIdx: number;
  totalCycles: number;
  connected?: boolean;
}

export default function RobotStatus({ joints, gripperMm, taskStatus, cycleIdx, totalCycles, connected = true }: RobotStatusProps) {
  const progress = totalCycles > 0 ? (cycleIdx / totalCycles) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', opacity: connected ? 1 : 0.5 }}>
      {/* Joint states */}
      <div>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)', marginBottom: 6,
        }}>
          Joint States · M0609
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{
              background: 'var(--color-bg-surface-2)',
              border: `1px solid ${connected ? 'var(--color-border-subtle)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '5px 7px',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 1 }}>
                J{i + 1}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: connected ? 'var(--color-cyan)' : 'var(--color-text-disabled)' }}>
                {connected ? <>{joints[i]?.toFixed(1)}<span style={{ fontSize: 9, color: 'var(--color-text-disabled)' }}>°</span></> : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gripper */}
      <div>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)', marginBottom: 5,
        }}>
          Gripper · RG2
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            flex: 1, height: 5,
            background: 'var(--color-bg-surface-2)',
            borderRadius: 'var(--radius-full)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: connected ? `${Math.min(gripperMm / 75 * 100, 100)}%` : '0%',
              background: 'var(--color-amber)',
              borderRadius: 'var(--radius-full)',
              transition: 'width 300ms ease',
            }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: connected ? 'var(--color-amber)' : 'var(--color-text-disabled)', minWidth: 46 }}>
            {connected ? `${gripperMm.toFixed(1)} mm` : '— mm'}
          </span>
        </div>
      </div>

      {/* Task progress */}
      {taskStatus !== 'idle' && (
        <div>
          <div style={{
            fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)', marginBottom: 5,
          }}>
            Task Progress
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              flex: 1, height: 5,
              background: 'var(--color-bg-surface-2)',
              borderRadius: 'var(--radius-full)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: taskStatus === 'error' ? 'var(--color-red)' : 'var(--color-cyan)',
                borderRadius: 'var(--radius-full)',
                transition: 'width 300ms ease',
              }} />
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: taskStatus === 'error' ? 'var(--color-red)' : 'var(--color-cyan)',
              minWidth: 32,
            }}>
              {cycleIdx}/{totalCycles}
            </span>
          </div>
        </div>
      )}

      {/* End-effector XYZ */}
      <div>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)', marginBottom: 5,
        }}>
          End-Effector
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
          {(['X', 'Y', 'Z'] as string[]).map(axis => (
            <div key={axis} style={{
              background: 'var(--color-bg-surface-2)',
              border: `1px solid ${connected ? 'var(--color-border-subtle)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '5px 7px',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 1 }}>{axis}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: connected ? 'var(--color-text-primary)' : 'var(--color-text-disabled)' }}>
                —
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
