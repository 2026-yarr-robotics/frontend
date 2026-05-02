import { useState, useCallback, useRef } from 'react';
import './index.css';

import Header from './components/Header';
import CameraPanel from './components/CameraPanel';
import CommandInput from './components/CommandInput';
import LogFeed from './components/LogFeed';
import RobotStatus from './components/RobotStatus';
import type { LogEntry, LogLevel } from './components/LogFeed';
import type { TaskStatus } from './components/RobotStatus';

// ─── Simulated task log sequence ──────────────────────────────────
interface LogStep {
  delay: number;
  level: LogLevel;
  msg: string;
}

const TASK_LOG_SEQUENCE: LogStep[] = [
  { delay: 0,    level: 'INFO', msg: 'Task received: Stack cups into pyramid' },
  { delay: 300,  level: 'INFO', msg: 'Moving HOME' },
  { delay: 900,  level: 'OK',   msg: 'HOME reached — grip=OPEN' },
  { delay: 1200, level: 'INFO', msg: 'CYCLE 1/6  pick(stack=1, z=0.336)' },
  { delay: 1800, level: 'INFO', msg: 'Planning trajectory…' },
  { delay: 2400, level: 'OK',   msg: 'Grip OK  width=44.2mm' },
  { delay: 3000, level: 'INFO', msg: 'CYCLE 2/6  place y_off=+79mm L1 z=0.418' },
  { delay: 3800, level: 'OK',   msg: 'Place OK' },
  { delay: 4200, level: 'INFO', msg: 'CYCLE 3/6  pick(stack=2, z=0.368)' },
  { delay: 5000, level: 'OK',   msg: 'Grip OK  width=44.0mm' },
  { delay: 5600, level: 'INFO', msg: 'CYCLE 4/6  place y_off=-79mm L1 z=0.418' },
  { delay: 6200, level: 'OK',   msg: 'Place OK' },
  { delay: 6600, level: 'INFO', msg: 'CYCLE 5/6  pick(stack=3, z=0.400)' },
  { delay: 7200, level: 'OK',   msg: 'Grip OK  width=43.8mm' },
  { delay: 7800, level: 'INFO', msg: 'CYCLE 6/6  place pyramid apex z=0.502' },
  { delay: 8600, level: 'OK',   msg: 'Place OK' },
  { delay: 9000, level: 'OK',   msg: '3-2-1 pyramid complete — Moving HOME' },
];

function now(): string {
  return new Date().toTimeString().slice(0, 8);
}

export default function App() {
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [rosConnected, setRosConnected] = useState(true);
  const [taskStatus, setTaskStatus]     = useState<TaskStatus>('idle');
  const [cycleIdx, setCycleIdx]         = useState(0);
  const totalCycles                     = 6;
  const [logs, setLogs]                 = useState<LogEntry[]>([
    { time: now(), level: 'INFO', msg: 'Dashboard connected — ROS 2 bridge active' },
    { time: now(), level: 'OK',   msg: 'Doosan M0609 ready · MoveIt 2 online' },
  ]);
  const [joints, setJoints]             = useState<number[]>([0, -30, 90, 0, 90, 0]);
  const [gripperMm, setGripperMm]       = useState(75);
  const timersRef                       = useRef<ReturnType<typeof setTimeout>[]>([]);

  function addLog(level: LogLevel, msg: string) {
    setLogs(prev => [...prev, { time: now(), level, msg }]);
  }

  function clearTimers() {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  }

  function animateGripper(target: number, duration: number) {
    const steps = 20;
    setGripperMm(start => {
      const step = (target - start) / steps;
      for (let i = 0; i <= steps; i++) {
        const t = setTimeout(
          () => setGripperMm(start + step * i),
          (duration / steps) * i,
        );
        timersRef.current.push(t);
      }
      return start; // immediate state unchanged; animation updates via timeouts
    });
  }

  function runTask() {
    setTaskStatus('planning');
    setCycleIdx(0);
    clearTimers();

    TASK_LOG_SEQUENCE.forEach(({ delay, level, msg }) => {
      const t = setTimeout(() => {
        addLog(level, msg);
        const m = msg.match(/CYCLE (\d+)\/(\d+)/);
        if (m) {
          setCycleIdx(parseInt(m[1]));
          setTaskStatus('executing');
          setJoints(prev => prev.map(j => j + (Math.random() - 0.5) * 20));
          setGripperMm(Math.random() > 0.5 ? 10 : 60);
        }
      }, delay);
      timersRef.current.push(t);
    });

    const totalDuration = TASK_LOG_SEQUENCE[TASK_LOG_SEQUENCE.length - 1].delay + 500;
    const done = setTimeout(() => {
      setTaskStatus('complete');
      setCycleIdx(6);
      setGripperMm(75);
      setJoints([0, -30, 90, 0, 90, 0]);
      const idle = setTimeout(() => setTaskStatus('idle'), 3000);
      timersRef.current.push(idle);
    }, totalDuration);
    timersRef.current.push(done);
  }

  const handleCommand = useCallback((cmd: string) => {
    if (!rosConnected) {
      addLog('ERR', 'ROS bridge disconnected — command ignored');
      return;
    }
    if (taskStatus !== 'idle') {
      addLog('WARN', `Task busy — "${cmd}" queued`);
      return;
    }

    addLog('INFO', `> ${cmd}`);

    if (/stop/i.test(cmd)) {
      addLog('WARN', 'Stop command received — aborting');
      return;
    }
    if (/home/i.test(cmd)) {
      setTaskStatus('executing');
      const t = setTimeout(() => {
        addLog('OK', 'HOME reached');
        setTaskStatus('idle');
        setJoints([0, -30, 90, 0, 90, 0]);
      }, 1500);
      timersRef.current.push(t);
      return;
    }
    if (/open/i.test(cmd))  { addLog('INFO', 'Opening gripper');  animateGripper(75, 300); return; }
    if (/close/i.test(cmd)) { addLog('INFO', 'Closing gripper'); animateGripper(0, 300);  return; }
    if (/stack|unstack/i.test(cmd)) { runTask(); return; }

    addLog('WARN', `Unknown command: "${cmd}"`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosConnected, taskStatus]);

  function handleAbort() {
    clearTimers();
    setTaskStatus('error');
    addLog('ERR', 'Task aborted by operator');
    setGripperMm(75);
    const reset = setTimeout(() => {
      setTaskStatus('idle');
      setCycleIdx(0);
    }, 2000);
    timersRef.current.push(reset);
  }

  function handleCameraClick({ x, y }: { x: string; y: string }) {
    addLog('INFO', `Target selected: (${x}%, ${y}%)`);
  }

  function toggleRos() {
    setRosConnected(prev => {
      const next = !prev;
      addLog(next ? 'OK' : 'ERR', next ? 'ROS bridge reconnected' : 'ROS bridge disconnected');
      return next;
    });
  }

  const isRunning = taskStatus === 'planning' || taskStatus === 'executing';

  return (
    <div className="dashboard-layout">
      {/* ── Header ── */}
      <Header
        rosConnected={rosConnected}
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
              <button
                className={`ds-btn sm ${rosConnected ? 'ghost' : 'secondary'}`}
                onClick={toggleRos}
                style={{ fontSize: 10 }}
              >
                {rosConnected ? 'Disconnect ROS' : 'Connect ROS'}
              </button>
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
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="ds-btn primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={!rosConnected || isRunning}
                  onClick={() => handleCommand('Stack cups into pyramid')}
                >
                  Stack
                </button>
                <button
                  className="ds-btn secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={!rosConnected || isRunning}
                  onClick={() => handleCommand('Unstack pyramid')}
                >
                  Unstack
                </button>
              </div>
              <button
                className="ds-btn ghost"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={!rosConnected || isRunning}
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
            isActive
            isLive={rosConnected}
            fps={rosConnected ? 30 : undefined}
            width={640}
            imageSrc="/eye_to_hand.png"
            onClickFeed={handleCameraClick}
          />
          <CameraPanel
            title="Eye-in-Hand"
            topic="/camera/eye_in_hand/image_raw"
            isActive={false}
            isLive={rosConnected}
            fps={rosConnected ? 30 : undefined}
            width={640}
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
