import { useState, useCallback } from 'react';
import './index.css';

import Header from './components/Header';
import CameraPanel from './components/CameraPanel';
import CommandInput from './components/CommandInput';
import LogFeed from './components/LogFeed';
import RobotStatus from './components/RobotStatus';
import type { LogEntry, LogLevel } from './components/LogFeed';
import type { TaskStatus } from './components/RobotStatus';
import { useJsonWebSocket } from './hooks/useWebSocket';
import { startBringup, stopBringup, startTask, stopTask } from './api';

interface RobotState {
  joints: { name: string[]; position: number[]; velocity: number[]; effort: number[] };
  task: { name: string | null; status: string };
  tasks: { name: string; command: string; status: string; pid: number | null }[];
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
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: now(), level: 'INFO', msg: 'Dashboard loaded — connecting to server…' },
  ]);
  const [joints, setJoints] = useState<number[]>(DEFAULT_JOINTS);
  const [gripperMm] = useState(75);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('idle');
  const [cycleIdx, setCycleIdx] = useState(0);
  const [bringupActive, setBringupActive] = useState(false);
  const [robotIp] = useState('192.168.1.100');
  const [wsConnected, setWsConnected] = useState(false);
  const [selectMode, setSelectMode] = useState<SelectMode>(null);
  const totalCycles = 6;

  function addLog(level: LogLevel, msg: string) {
    setLogs(prev => [...prev, { time: now(), level, msg }]);
  }

  // ── WebSocket: robot state (10Hz) ──
  const handleRobotState = useCallback((data: RobotState) => {
    setWsConnected(true);
    if (data.joints?.position?.length) {
      setJoints(data.joints.position.map((rad: number) => (rad * 180) / Math.PI));
    }
    const taskName = data.task?.name;
    const taskSt = data.task?.status;
    setBringupActive(taskName === BRINGUP_TASK && taskSt === 'running');

    if (taskSt === 'running') setTaskStatus('executing');
    else if (taskSt === 'idle' || taskSt === null) setTaskStatus('idle');
    else if (taskSt === 'failed') setTaskStatus('error');
  }, []);

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

  // ── Enter target selection mode ──
  function requestStack() {
    if (!wsConnected || !bringupActive) {
      addLog('WARN', 'Bringup must be active to use camera-guided tasks');
      return;
    }
    setSelectMode('stack');
    addLog('INFO', 'Click the nested cup stack on the Eye-in-Hand camera');
  }

  function requestUnstack() {
    if (!wsConnected || !bringupActive) {
      addLog('WARN', 'Bringup must be active to use camera-guided tasks');
      return;
    }
    setSelectMode('unstack');
    addLog('INFO', 'Click the pyramid center on the Eye-in-Hand camera');
  }

  // ── Camera click → launch web task with pixel coords ──
  async function handleCameraClick({ px, py }: { px: number; py: number }) {
    if (selectMode === 'stack') {
      addLog('INFO', `Target pixel: (${px}, ${py}) — launching cup_pyramid_web…`);
      setSelectMode(null);
      setTaskStatus('planning');
      setCycleIdx(0);
      try {
        await startTask('cup_pyramid_web', { pixel_x: String(px), pixel_y: String(py) });
      } catch (e) {
        addLog('ERR', (e as Error).message);
        setTaskStatus('idle');
      }
      return;
    }
    if (selectMode === 'unstack') {
      addLog('INFO', `Target pixel: (${px}, ${py}) — launching cup_unstack_web…`);
      setSelectMode(null);
      setTaskStatus('planning');
      setCycleIdx(0);
      try {
        await startTask('cup_unstack_web', { pixel_x: String(px), pixel_y: String(py) });
      } catch (e) {
        addLog('ERR', (e as Error).message);
        setTaskStatus('idle');
      }
      return;
    }
    addLog('INFO', `Pixel: (${px}, ${py})`);
  }

  // ── Command handler ──
  const handleCommand = useCallback(async (cmd: string) => {
    addLog('INFO', `> ${cmd}`);

    try {
      if (/stop/i.test(cmd)) {
        addLog('WARN', 'Sending stop…');
        await stopTask('cup_pyramid_web');
        await stopTask('cup_unstack_web');
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
    stopTask('cup_pyramid_web').catch(() => {});
    stopTask('cup_unstack_web').catch(() => {});
    setTaskStatus('error');
    setSelectMode(null);
    addLog('ERR', 'Task aborted by operator');
  }

  const isRunning = taskStatus === 'planning' || taskStatus === 'executing';
  const cameraActive = wsConnected && bringupActive;

  return (
    <div className="dashboard-layout">
      {/* ── Header ── */}
      <Header
        rosConnected={wsConnected}
        taskStatus={taskStatus}
        isRunning={isRunning}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        onAbort={handleAbort}
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
                <span className={`status-dot ${wsConnected ? 'live' : 'error'}`} />
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: wsConnected ? 'var(--color-green)' : 'var(--color-red)',
                }}>
                  {wsConnected ? 'CONNECTED' : 'OFFLINE'}
                </span>
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              <RobotStatus
                joints={joints}
                gripperMm={gripperMm}
                taskStatus={taskStatus}
                cycleIdx={cycleIdx}
                totalCycles={totalCycles}
                connected={wsConnected}
              />
            </div>

            {/* Quick actions */}
            <div style={{
              padding: '10px 12px',
              borderTop: '1px solid var(--color-border-default)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {/* Bringup Real toggle */}
              <button
                className={`ds-btn ${bringupActive ? 'danger' : 'secondary'}`}
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={!wsConnected}
                onClick={toggleBringup}
              >
                {bringupActive ? 'Stop Bringup' : `Start Bringup (${robotIp})`}
              </button>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className={`ds-btn ${selectMode === 'stack' ? 'danger' : 'primary'}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={!wsConnected || isRunning}
                  onClick={selectMode === 'stack' ? () => setSelectMode(null) : requestStack}
                >
                  {selectMode === 'stack' ? 'Cancel' : 'Stack'}
                </button>
                <button
                  className={`ds-btn ${selectMode === 'unstack' ? 'danger' : 'secondary'}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={!wsConnected || isRunning}
                  onClick={selectMode === 'unstack' ? () => setSelectMode(null) : requestUnstack}
                >
                  {selectMode === 'unstack' ? 'Cancel' : 'Unstack'}
                </button>
              </div>
              <button
                className="ds-btn ghost"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={!wsConnected || isRunning}
                onClick={() => handleCommand('Move to HOME')}
              >
                Return HOME
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="dashboard-main">
        {/* Camera row */}
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
          <CameraPanel
            title="Eye-to-Hand"
            topic="/fixed_camera/color/image_raw/compressed"
            isActive={wsConnected}
            isLive={wsConnected}
            streamUrl="/ws/camera/handtoeye"
          />
          <CameraPanel
            title="Eye-in-Hand"
            topic="/camera/eye_in_hand/image_raw"
            isActive={cameraActive}
            isLive={cameraActive}
            streamUrl="/ws/camera/handineye"
            onClickFeed={handleCameraClick}
          />
          {/* Selection mode overlay indicator */}
          {selectMode && (
            <div style={{
              position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
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

        {/* Bottom row */}
        <div style={{ display: 'flex', gap: 12, height: 220, flexShrink: 0 }}>
          <LogFeed entries={logs} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 400, flexShrink: 0 }}>
            <CommandInput onSend={handleCommand} disabled={isRunning} />
          </div>
        </div>
      </main>
    </div>
  );
}
