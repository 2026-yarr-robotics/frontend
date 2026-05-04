// CameraPanel.tsx — Live camera stream panel with crosshair overlay and capture
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

interface Capture {
  id: number;
  url: string;
  timestamp: string;
  filename: string;
}

export default function CameraPanel({ title, topic, isActive, isLive, coords, fps, width, streamUrl, onClickFeed }: CameraPanelProps) {
  const [hovered, setHovered] = useState(false);
  const [clickPos, setClickPos] = useState<ClickPos | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [wsRef, setWsRef] = useState<WebSocket | null>(null);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const captureIdRef = useRef(0);

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
      setCurrentBlob(blob);
    };
    ws.onclose = () => {
      setWsRef(null);
      if (mountedRef.current && isLive && isActive) {
        reconnectTimerRef.current = setTimeout(connectStream, 2000);
      }
    };
    ws.onerror = () => ws.close();
    setWsRef(ws);
  }, [streamUrl, isLive, isActive]);

  useEffect(() => {
    mountedRef.current = true;
    connectStream();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef?.close();
      setWsRef(null);
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, [connectStream]);

  useEffect(() => {
    if (!isLive || !isActive) {
      setImgUrl(null);
      setCurrentBlob(null);
    }
  }, [isLive, isActive]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    const scaleX = imgRef.current ? imgRef.current.naturalWidth / rect.width : 1;
    const scaleY = imgRef.current ? imgRef.current.naturalHeight / rect.height : 1;
    const px = Math.round(displayX * scaleX);
    const py = Math.round(displayY * scaleY);
    setClickPos({ px, py, displayX, displayY });
    onClickFeed?.({ px, py });
  }

  function handleCapture() {
    if (!currentBlob) return;

    captureIdRef.current += 1;
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
    const filename = `${title.toLowerCase().replace(/\s+/g, '_')}_${now.getTime()}.jpg`;

    const url = URL.createObjectURL(currentBlob);
    const newCapture: Capture = {
      id: captureIdRef.current,
      url,
      timestamp,
      filename,
    };

    setCaptures(prev => [newCapture, ...prev].slice(0, 3));

    // Trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    // Play shutter sound
    const audio = new Audio('/shutter.mp3');
    audio.volume = 0.3;
    audio.play().catch(() => {}); // Ignore if audio fails
  }

  function handleDownloadCapture(capture: Capture) {
    const a = document.createElement('a');
    a.href = capture.url;
    a.download = capture.filename;
    a.click();
  }

  function handleDeleteCapture(id: number) {
    setCaptures(prev => {
      const capture = prev.find(c => c.id === id);
      if (capture) {
        URL.revokeObjectURL(capture.url);
      }
      return prev.filter(c => c.id !== id);
    });
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
          {/* Capture button */}
          <button
            className={`ds-btn ghost sm ${hasFeed ? '' : 'disabled'}`}
            onClick={handleCapture}
            disabled={!hasFeed}
            style={{
              opacity: hasFeed ? 1 : 0.5,
              cursor: hasFeed ? 'pointer' : 'not-allowed',
            }}
            title="Capture frame"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
          {fps != null && hasFeed && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-disabled)' }}>
              {fps} fps
            </span>
          )}
          {!isActive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="status-dot error" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-red)' }}>DISCONNECTED</span>
            </div>
          ) : isLive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className={`status-dot ${hasFeed ? 'live' : 'idle'}`} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: hasFeed ? 'var(--color-green)' : 'var(--color-text-disabled)' }}>
                {hasFeed ? 'LIVE' : 'WAITING'}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="status-dot error" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-red)' }}>DISCONNECTED</span>
            </div>
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
          background: (isLive && isActive)
            ? 'radial-gradient(ellipse at 40% 50%, #0a1020 0%, #050810 70%)'
            : '#060810',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {(!isActive || !isLive) && (
            <div style={{ textAlign: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke="var(--color-red)" strokeWidth="1.5" strokeLinecap="round"
                style={{ opacity: 0.6 }}>
                <path d="M23 7l-7 5 7 5V7z"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                color: 'var(--color-red)', marginTop: 8, letterSpacing: '0.08em',
                opacity: 0.8,
              }}>
                NO SIGNAL
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 4, opacity: 0.5 }}>
                {topic}
              </div>
            </div>
          )}
          {isActive && isLive && !hasFeed && (
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

      {/* Captures thumbnails */}
      {captures.length > 0 && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--color-border-subtle)',
          display: 'flex', gap: 8, flexShrink: 0,
        }}>
          {captures.map(capture => (
            <div
              key={capture.id}
              style={{
                position: 'relative',
                width: 60, height: 45,
                background: '#000',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
              onClick={() => handleDownloadCapture(capture)}
            >
              <img
                src={capture.url}
                alt={capture.filename}
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                }}
              />
              <button
                className="ds-btn ghost sm"
                style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 16, height: 16,
                  padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.7)',
                  borderRadius: '50%',
                  fontSize: 10,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCapture(capture.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
