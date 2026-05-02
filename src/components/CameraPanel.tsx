// CameraPanel.tsx — Live camera stream panel with crosshair overlay
import { useState } from 'react';

export interface CameraPanelProps {
  title: string;
  topic: string;
  isActive: boolean;
  isLive: boolean;
  coords?: string;
  fps?: number;
  width?: number;
  onClickFeed?: (pos: { x: string; y: string }) => void;
}

interface ClickPos {
  x: string;
  y: string;
  px: number;
  py: number;
}

export default function CameraPanel({ title, topic, isActive, isLive, coords, fps, width, onClickFeed }: CameraPanelProps) {
  const [hovered, setHovered] = useState(false);
  const [clickPos, setClickPos] = useState<ClickPos | null>(null);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
    const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
    setClickPos({ x, y, px: e.clientX - rect.left, py: e.clientY - rect.top });
    onClickFeed?.({ x, y });
  }

  return (
    <div className="ds-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="ds-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round">
            <path d="M23 7l-7 5 7 5V7z"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
          <span className="ds-card-label">{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {fps != null && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-disabled)' }}>
              {fps} fps
            </span>
          )}
          {isLive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="status-dot live" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-green)' }}>LIVE</span>
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-disabled)' }}>OFFLINE</span>
          )}
        </div>
      </div>

      {/* Feed area */}
      <div
        style={{
          flex: 1, background: '#000', position: 'relative',
          cursor: isLive ? 'crosshair' : 'default',
          boxShadow: isActive && isLive ? 'inset 0 0 0 1px oklch(75% 0.18 200 / 0.4)' : 'none',
          minHeight: 0, overflow: 'hidden',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={isLive ? handleClick : undefined}
      >
        {/* Background / simulated feed */}
        <div style={{
          position: 'absolute', inset: 0,
          background: isLive
            ? 'radial-gradient(ellipse at 40% 50%, #0a1020 0%, #050810 70%)'
            : '#060810',
          opacity: isLive ? 1 : 0.4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {!isLive && (
            <div style={{ textAlign: 'center', opacity: 0.3 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round">
                <path d="M23 7l-7 5 7 5V7z"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                {topic}
              </div>
            </div>
          )}
          {isLive && (
            <div style={{ opacity: 0.15, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              {topic}
            </div>
          )}
        </div>

        {/* Simulated scene SVG */}
        {isLive && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice">
            <g stroke="oklch(75% 0.18 200 / 0.06)" strokeWidth="0.5" fill="none">
              {[80, 160, 240].map(x => <line key={x} x1={x} y1="0" x2={x} y2="240"/>)}
              {[60, 120, 180].map(y => <line key={y} x1="0" y1={y} x2="320" y2={y}/>)}
            </g>
            <circle cx="160" cy="140" r="60"
              stroke="oklch(75% 0.18 200 / 0.12)" strokeWidth="1" fill="none" strokeDasharray="4 3"/>
            <g fill="oklch(72% 0.18 55 / 0.25)" stroke="oklch(72% 0.18 55 / 0.5)" strokeWidth="0.8">
              <rect x="132" y="160" width="14" height="20" rx="1"/>
              <rect x="153" y="160" width="14" height="20" rx="1"/>
              <rect x="174" y="160" width="14" height="20" rx="1"/>
              <rect x="143" y="140" width="14" height="20" rx="1"/>
              <rect x="163" y="140" width="14" height="20" rx="1"/>
              <rect x="153" y="120" width="14" height="20" rx="1"/>
            </g>
          </svg>
        )}

        {/* Click crosshair */}
        {clickPos && isLive && (
          <div style={{
            position: 'absolute',
            left: clickPos.px - 8, top: clickPos.py - 8,
            width: 16, height: 16, pointerEvents: 'none',
          }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'var(--color-cyan)', transform: 'translateX(-50%)' }}/>
            <div style={{ position: 'absolute', top: '50%', left: 0, height: 1, width: '100%', background: 'var(--color-cyan)', transform: 'translateY(-50%)' }}/>
          </div>
        )}

        {/* Coordinate overlay */}
        {coords && isLive && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-cyan)',
            background: 'rgba(13,15,20,0.75)', padding: '2px 6px', borderRadius: 3,
          }}>
            {coords}
          </div>
        )}

        {/* Click hint */}
        {isLive && hovered && !clickPos && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'oklch(75% 0.18 200 / 0.7)',
            background: 'rgba(13,15,20,0.7)', padding: '2px 6px', borderRadius: 3,
          }}>
            Click to select target
          </div>
        )}

        {/* Clicked coordinate readout */}
        {clickPos && isLive && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-cyan)',
            background: 'rgba(13,15,20,0.75)', padding: '2px 6px', borderRadius: 3,
          }}>
            ({clickPos.x}%, {clickPos.y}%)
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '5px 12px', borderTop: '1px solid var(--color-border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-disabled)' }}>
          {isLive ? `${width ?? 640}×480` : '—'}
        </span>
        {clickPos && isLive && (
          <button className="ds-btn ghost sm" onClick={() => setClickPos(null)}>Clear</button>
        )}
      </div>
    </div>
  );
}
