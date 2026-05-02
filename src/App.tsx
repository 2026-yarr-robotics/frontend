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

  // ── Command handler ──
  const handleCommand = useCallback(async (cmd: string) => {
    addLog('INFO', `> ${cmd}`);

    try {
      if (/stop/i.test(cmd)) {
        addLog('WARN', 'Sending stop…');
        await stopTask('cup_pyramid');
        setTaskStatus('idle');
        return;
      }
      if (/home/i.test(cmd)) {
        addLog('INFO', 'Home command sent');
        return;
      }
      if (/stack/i.test(cmd)) {
        addLog('INFO', 'Starting cup_pyramid task…');
        setTaskStatus('planning');
        setCycleIdx(0);
        await startTask('cup_pyramid');
        return;
      }
      if (/unstack/i.test(cmd)) {
        addLog('INFO', 'Starting cup_unstack task…');
        setTaskStatus('planning');
        setCycleIdx(0);
        await startTask('cup_unstack');
        return;
      }
      addLog('WARN', `Unknown command: "${cmd}"`);
    } catch (e) {
      addLog('ERR', (e as Error).message);
    }
  }, []);

  function handleAbort() {
    stopTask('cup_pyramid').catch(() => {});
    stopTask('cup_unstack').catch(() => {});
    setTaskStatus('error');
    addLog('ERR', 'Task aborted by operator');
  }

  function handleCameraClick({ x, y }: { x: string; y: string }) {
    addLog('INFO', `Target selected: (${x}%, ${y}%)`);
  }

  const isRunning = taskStatus === 'planning' || taskStatus === 'executing';

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
                  className="ds-btn primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={!wsConnected || isRunning}
                  onClick={() => handleCommand('Stack cups into pyramid')}
                >
                  Stack
                </button>
                <button
                  className="ds-btn secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={!wsConnected || isRunning}
                  onClick={() => handleCommand('Unstack pyramid')}
                >
                  Unstack
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
            topic="/camera/eye_to_hand/image_raw"
            isActive={false}
            isLive={wsConnected}
          />
          <CameraPanel
            title="Eye-in-Hand"
            topic="/camera/eye_in_hand/image_raw"
            isActive
            isLive={wsConnected && bringupActive}
            streamUrl="/ws/camera/handineye"
            onClickFeed={handleCameraClick}
          />
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
