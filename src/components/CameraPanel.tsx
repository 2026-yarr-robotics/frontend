// CameraPanel.tsx — Live camera stream panel with crosshair overlay
import { useState, useEffect, useRef, useCallback } from 'react';
import { wsUrl } from '../hooks/useWebSocket';

export interface CameraPanelProps {
  title: string;
  topic: string;
  isActive: boolean;
  isLive: boolean;
  coords?: string;
  fps?: number;
  width?: number;
  /** WebSocket path for MJPG binary frames (e.g. "/ws/camera/handineye") */
  streamUrl?: string;
  /** Called with actual pixel coordinates in the camera image */
  onClickFeed?: (pos: { px: number; py: number }) => void;
}

interface ClickPos {
  px: number;
  py: number;
  displayX: number;
  displayY: number;
}

export default function CameraPanel({ title, topic, isActive, isLive, coords, fps, width, streamUrl, onClickFeed }: CameraPanelProps) {
  const [hovered, setHovered] = useState(false);
  const [clickPos, setClickPos] = useState<ClickPos | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connectStream = useCallback(() => {
    if (!mountedRef.current || !streamUrl || !isLive || !isActive) return;

    const ws = new WebSocket(wsUrl(streamUrl));
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (e: MessageEvent) => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
      const blob = new Blob([e.data], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      prevUrlRef.current = url;
      setImgUrl(url);
    };
    ws.onclose = () => {
      wsRef.current = null;
      if (mountedRef.current && isLive && isActive) {
        reconnectTimerRef.current = setTimeout(connectStream, 2000);
      }
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [streamUrl, isLive, isActive]);

  useEffect(() => {
    mountedRef.current = true;
    connectStream();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, [connectStream]);

  // Reset image when stream disconnects
  useEffect(() => {
    if (!isLive || !isActive) {
      setImgUrl(null);
    }
  }, [isLive, isActive]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    // Convert display coordinates to actual camera pixel coordinates
    const scaleX = imgRef.current ? imgRef.current.naturalWidth / rect.width : 1;
    const scaleY = imgRef.current ? imgRef.current.naturalHeight / rect.height : 1;
    const px = Math.round(displayX * scaleX);
    const py = Math.round(displayY * scaleY);
    setClickPos({ px, py, displayX, displayY });
    onClickFeed?.({ px, py });
  }

  const hasFeed = isLive && imgUrl;

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
          {fps != null && hasFeed && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-disabled)' }}>
              {fps} fps
            </span>
          )}
          {isLive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className={`status-dot ${hasFeed ? 'live' : 'idle'}`} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: hasFeed ? 'var(--color-green)' : 'var(--color-text-disabled)' }}>
                {hasFeed ? 'LIVE' : 'WAITING'}
              </span>
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
          cursor: hasFeed ? 'crosshair' : 'default',
          boxShadow: hasFeed ? 'inset 0 0 0 1px oklch(75% 0.18 200 / 0.4)' : 'none',
          minHeight: 0, overflow: 'hidden',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={hasFeed ? handleClick : undefined}
      >
        {/* Background */}
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
          {isLive && !hasFeed && (
            <div style={{ opacity: 0.15, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              {topic}
            </div>
          )}
        </div>

        {/* Live camera image from WebSocket */}
        {hasFeed && (
          <img
            ref={imgRef}
            src={imgUrl}
            alt={title}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              opacity: 0.92,
            }}
          />
        )}

        {/* HUD overlay */}
        {hasFeed && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice">
            <g stroke="oklch(75% 0.18 200 / 0.25)" strokeWidth="0.5" fill="none">
              {[80, 160, 240].map(x => <line key={x} x1={x} y1="0" x2={x} y2="240"/>)}
              {[60, 120, 180].map(y => <line key={y} x1="0" y1={y} x2="320" y2={y}/>)}
            </g>
            <circle cx="160" cy="155" r="40"
              stroke="oklch(75% 0.18 200 / 0.5)" strokeWidth="1" fill="none" strokeDasharray="4 3"/>
            <line x1="155" y1="155" x2="165" y2="155" stroke="oklch(75% 0.18 200 / 0.8)" strokeWidth="1"/>
            <line x1="160" y1="150" x2="160" y2="160" stroke="oklch(75% 0.18 200 / 0.8)" strokeWidth="1"/>
          </svg>
        )}

        {/* Click crosshair */}
        {clickPos && hasFeed && (
          <div style={{
            position: 'absolute',
            left: clickPos.displayX - 8, top: clickPos.displayY - 8,
            width: 16, height: 16, pointerEvents: 'none',
          }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'var(--color-cyan)', transform: 'translateX(-50%)' }}/>
            <div style={{ position: 'absolute', top: '50%', left: 0, height: 1, width: '100%', background: 'var(--color-cyan)', transform: 'translateY(-50%)' }}/>
          </div>
        )}

        {/* Coordinate overlay */}
        {coords && hasFeed && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-cyan)',
            background: 'rgba(13,15,20,0.75)', padding: '2px 6px', borderRadius: 3,
          }}>
            {coords}
          </div>
        )}

        {/* Click hint */}
        {hasFeed && hovered && !clickPos && (
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
        {clickPos && hasFeed && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-cyan)',
            background: 'rgba(13,15,20,0.75)', padding: '2px 6px', borderRadius: 3,
          }}>
            ({clickPos.px}, {clickPos.py})
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
          {hasFeed ? `${width ?? 640}×480` : '—'}
        </span>
        {clickPos && hasFeed && (
          <button className="ds-btn ghost sm" onClick={() => setClickPos(null)}>Clear</button>
        )}
      </div>
    </div>
  );
}
