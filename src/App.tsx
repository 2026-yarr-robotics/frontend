import { useState, useCallback, useEffect } from 'react';
import './index.css';

import Header from './components/Header';
import CameraPanel from './components/CameraPanel';
import CommandInput from './components/CommandInput';
import LogFeed from './components/LogFeed';
import RobotStatus from './components/RobotStatus';
import ManualControl from './components/ManualControl';
import type { LogEntry, LogLevel } from './components/LogFeed';
import type { TaskStatus } from './components/RobotStatus';
import { useJsonWebSocket } from './hooks/useWebSocket';
import { startBringup, stopBringup, startTask, stopTask, gripperControl, pixelToWorld, type EePosition } from './api';

interface RobotState {
  joints: { name: string[]; position: number[]; velocity: number[]; effort: number[] };
  task: { name: string | null; status: string };
  bringup: { name: string | null; status: string };
  tasks: { name: string; command: string; status: string; pid: number | null }[];
  ee_position?: EePosition | null;
}

interface TaskLog {
  task: string | null;
  status: string;
  log: string[];
}

function now(): string {
  return new Date().toTimeString().slice(0, 8);
}

const DEFAULT_JOINTS = [0, -30, 90, 0, 90, 0];
const BRINGUP_TASK = 'bringup_real';
type SelectMode = null | 'stack' | 'unstack';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: now(), level: 'INFO', msg: 'Dashboard loaded — connecting to server…' },
  ]);
  const [joints, setJoints] = useState<number[]>(DEFAULT_JOINTS);
  const [gripperMm] = useState(75);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('idle');
  const [cycleIdx, setCycleIdx] = useState(0);
  const [bringupActive, setBringupActive] = useState(false);
  const [robotOnline, setRobotOnline] = useState(false);
  const [moveCartesianRunning, setMoveCartesianRunning] = useState(false);
  const [robotIp, setRobotIp] = useState('192.168.1.100');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'live' | 'lost'>('connecting');
  const [lastDataTime, setLastDataTime] = useState<number>(0);
  const [eePosition, setEePosition] = useState<EePosition | null>(null);
  const [selectMode, setSelectMode] = useState<SelectMode>(null);
  const [cameraView, setCameraView] = useState<'both' | 'handtoeye' | 'handineye'>('both');
  const totalCycles = 6;

  function addLog(level: LogLevel, msg: string) {
    setLogs(prev => [...prev, { time: now(), level, msg }]);
  }

  // ── WebSocket: robot state (10Hz) ──
  const handleRobotState = useCallback((data: RobotState) => {
    const now = Date.now();
    setLastDataTime(now);
    setWsStatus('live');
    if (data.joints?.position?.length) {
      setJoints(data.joints.position.map((rad: number) => (rad * 180) / Math.PI));
    }

    setBringupActive(data.bringup?.status === 'running');

    // Robot is online if joint states are actually flowing (works for external bringup too)
    setRobotOnline((data.joints?.position?.length ?? 0) > 0);

    // Move commands are available only when move_cartesian service is running
    const mcTask = data.tasks?.find((t: { name: string; status: string }) => t.name === 'move_cartesian');
    setMoveCartesianRunning(mcTask?.status === 'running');

    if (data.ee_position) setEePosition(data.ee_position);

    const taskSt = data.task?.status;
    if (taskSt === 'running') setTaskStatus('executing');
    else if (taskSt === 'idle' || taskSt === null) setTaskStatus('idle');
    else if (taskSt === 'failed') setTaskStatus('error');
  }, []);

  // Check for disconnection (no data for 2 seconds)
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (Date.now() - lastDataTime > 2000 && wsStatus === 'live') {
        setWsStatus('lost');
        setRobotOnline(false);
        setMoveCartesianRunning(false);
      }
    }, 500);
    return () => clearInterval(checkInterval);
  }, [wsStatus, lastDataTime]);

  useJsonWebSocket<RobotState>('/ws/robot/state', handleRobotState);

  // ── WebSocket: task logs ──
  const handleTaskLog = useCallback((data: TaskLog) => {
    if (data.log?.length) {
      const newLogs: LogEntry[] = data.log.map(msg => ({
        time: now(),
        level: msg.includes('ERR') || msg.includes('FAIL') ? 'ERR' as LogLevel
          : msg.includes('OK') ? 'OK' as LogLevel
          : msg.includes('WARN') ? 'WARN' as LogLevel
          : 'INFO' as LogLevel,
        msg,
      }));
      setLogs(prev => [...prev, ...newLogs].slice(-200));
    }
    if (data.task && data.status === 'running') {
      setTaskStatus('executing');
    }
  }, []);

  useJsonWebSocket<TaskLog>('/ws/task/log', handleTaskLog);

  // ── Bringup toggle ──
  async function toggleBringup() {
    try {
      if (bringupActive) {
        addLog('INFO', 'Stopping bringup…');
        await stopBringup();
        addLog('OK', 'Bringup stopped');
      } else {
        addLog('INFO', `Starting bringup (real, ${robotIp})…`);
        await startBringup(robotIp);
        addLog('OK', 'Bringup started');
      }
    } catch (e) {
      addLog('ERR', `Bringup error: ${(e as Error).message}`);
    }
  }

  const wsConnected = wsStatus === 'live';
  const isRunning = taskStatus === 'planning' || taskStatus === 'executing';

  // ── Enter target selection mode ──
  function requestStack() {
    if (!wsConnected || !robotOnline) {
      addLog('WARN', 'Robot must be online to use camera-guided tasks');
      return;
    }
    setSelectMode('stack');
    addLog('INFO', 'Click the nested cup stack on the Eye-in-Hand camera');
  }

  function requestUnstack() {
    if (!wsConnected || !robotOnline) {
      addLog('WARN', 'Robot must be online to use camera-guided tasks');
      return;
    }
    setSelectMode('unstack');
    addLog('INFO', 'Click the pyramid center on the Eye-in-Hand camera');
  }

  // ── Camera click → log world coords + launch web task ──
  async function handleCameraClick({ px, py }: { px: number; py: number }) {
    // Try to get world coordinates immediately for the log
    try {
      const w = await pixelToWorld(px, py);
      addLog('INFO', `Pixel (${px}, ${py}) → world (${w.x.toFixed(3)}, ${w.y.toFixed(3)}, ${w.z.toFixed(3)}) depth=${w.depth_mm}mm`);
    } catch {
      addLog('INFO', `Pixel: (${px}, ${py})`);
    }

    if (selectMode === 'stack') {
      addLog('INFO', `Launching cup_pyramid_select…`);
      setSelectMode(null);
      setTaskStatus('planning');
      setCycleIdx(0);
      try {
        await startTask('cup_pyramid_select', { pixel_x: String(px), pixel_y: String(py) });
      } catch (e) {
        addLog('ERR', (e as Error).message);
        setTaskStatus('idle');
      }
      return;
    }
    if (selectMode === 'unstack') {
      addLog('INFO', `Launching cup_unstack_select…`);
      setSelectMode(null);
      setTaskStatus('planning');
      setCycleIdx(0);
      try {
        await startTask('cup_unstack_select', { pixel_x: String(px), pixel_y: String(py) });
      } catch (e) {
        addLog('ERR', (e as Error).message);
        setTaskStatus('idle');
      }
      return;
    }
  }

  // ── Command handler ──
  const handleCommand = useCallback(async (cmd: string) => {
    addLog('INFO', `> ${cmd}`);

    try {
      if (/stop/i.test(cmd)) {
        addLog('WARN', 'Sending stop…');
        await stopTask('cup_pyramid_select');
        await stopTask('cup_unstack_select');
        setTaskStatus('idle');
        setSelectMode(null);
        return;
      }
      if (/home/i.test(cmd)) {
        addLog('INFO', 'Home command sent');
        return;
      }
      if (/stack/i.test(cmd)) {
        requestStack();
        return;
      }
      if (/unstack/i.test(cmd)) {
        requestUnstack();
        return;
      }
      addLog('WARN', `Unknown command: "${cmd}"`);
    } catch (e) {
      addLog('ERR', (e as Error).message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected, bringupActive]);

  function handleAbort() {
    stopTask('cup_pyramid_select').catch(() => {});
    stopTask('cup_unstack_select').catch(() => {});
    setTaskStatus('error');
    setSelectMode(null);
    addLog('ERR', 'Task aborted by operator');
  }

  const gridCols = `${sidebarOpen ? 'var(--sidebar-width)' : '0px'} 1fr ${rightPanelOpen ? 'var(--right-panel-width)' : '0px'}`;

  return (
    <div className="dashboard-layout" style={{ gridTemplateColumns: gridCols }}>
      {/* ── Header ── */}
      <Header
        wsStatus={wsStatus}
        rosConnected={wsConnected}
        taskStatus={taskStatus}
        isRunning={isRunning}
        bringupActive={bringupActive}
        robotOnline={robotOnline}
        robotIp={robotIp}
        rightPanelOpen={rightPanelOpen}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        onToggleRightPanel={() => setRightPanelOpen(o => !o)}
        onAbort={handleAbort}
        onToggleBringup={toggleBringup}
        onChangeRobotIp={setRobotIp}
      />

      {/* ── Sidebar ── */}
      <aside
        className={`dashboard-sidebar ${sidebarOpen ? '' : 'collapsed'}`}
        style={{ width: sidebarOpen ? 'var(--sidebar-width)' : 0 }}
      >
        {sidebarOpen && (
          <>
            <div style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--color-border-default)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{
                fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
              }}>
                Robot Status
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className={`status-dot ${robotOnline ? 'live' : 'error'}`} />
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: robotOnline ? 'var(--color-green)' : 'var(--color-red)',
                }}>
                  {robotOnline ? 'CONNECTED' : 'OFFLINE'}
                </span>
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <RobotStatus
                joints={joints}
                gripperMm={gripperMm}
                taskStatus={taskStatus}
                cycleIdx={cycleIdx}
                totalCycles={totalCycles}
                connected={robotOnline}
                eePosition={eePosition}
              />
              <ManualControl
                disabled={!wsConnected || isRunning || !robotOnline}
                eePosition={eePosition}
              />
            </div>
          </>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="dashboard-main">
        {/* Camera row — fills all available height */}
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0, position: 'relative' }}>
          {cameraView !== 'handineye' && (
            <CameraPanel
              title="Eye-to-Hand"
              topic="/fixed_camera/color/image_raw/compressed"
              isActive={wsConnected}
              isLive={wsConnected}
              streamUrl="/ws/camera/handtoeye"
            />
          )}
          {cameraView !== 'handtoeye' && (
            <CameraPanel
              title="Eye-in-Hand"
              topic="/camera/eye_in_hand/image_raw"
              isActive={wsConnected}
              isLive={wsConnected}
              streamUrl="/ws/camera/handineye"
              onClickFeed={handleCameraClick}
            />
          )}

          {/* Camera view selector */}
          <div style={{
            position: 'absolute', top: 8, right: 8,
            display: 'flex', gap: 2,
            background: 'var(--color-bg-surface-1)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-sm)',
            padding: 2,
            zIndex: 10,
          }}>
            {([
              { key: 'both',      label: 'Both',    icon: (
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                  <rect x="0.5" y="0.5" width="5.5" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <rect x="8" y="0.5" width="5.5" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
              )},
              { key: 'handtoeye', label: 'Eye-to-Hand', icon: (
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                  <rect x="0.5" y="0.5" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <rect x="10.5" y="0.5" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1"/>
                </svg>
              )},
              { key: 'handineye', label: 'Eye-in-Hand', icon: (
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                  <rect x="0.5" y="0.5" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1"/>
                  <rect x="5.5" y="0.5" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
              )},
            ] as const).map(({ key, label, icon }) => (
              <button
                key={key}
                title={label}
                onClick={() => setCameraView(key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 24,
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  border: 'none',
                  background: cameraView === key
                    ? 'oklch(75% 0.18 200 / 0.2)'
                    : 'transparent',
                  color: cameraView === key
                    ? 'var(--color-cyan)'
                    : 'var(--color-text-tertiary)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {icon}
              </button>
            ))}
          </div>

          {selectMode && (
            <div style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              padding: '6px 16px', borderRadius: 20,
              background: selectMode === 'stack'
                ? 'oklch(68% 0.18 145 / 0.9)'
                : 'oklch(72% 0.18 55 / 0.9)',
              fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: '#fff',
              zIndex: 10, pointerEvents: 'none',
            }}>
              {selectMode === 'stack'
                ? 'Click nested cup stack on camera'
                : 'Click pyramid center on camera'}
            </div>
          )}
        </div>
      </main>

      {/* ── Right Panel: Log + Command ── */}
      <div
        className="dashboard-rightpanel"
        style={{ width: rightPanelOpen ? 'var(--right-panel-width)' : 0, overflow: 'hidden', transition: 'width var(--transition-base)' }}
      >
        {/* Log feed — scrollable, fills available space */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <LogFeed entries={logs} onClear={() => setLogs([])} />
        </div>
        {/* Command input pinned to bottom */}
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--color-border-default)' }}>
          <CommandInput onSend={handleCommand} disabled={isRunning} />
        </div>
      </div>
    </div>
  );
}
