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
import { startBringup, stopBringup, pickOne, getBaseUrl, setBaseUrl, type EePosition } from './api';

interface RobotState {
  joints: { name: string[]; position: number[]; velocity: number[]; effort: number[] };
  task: { name: string | null; status: string };
  bringup: { name: string | null; status: string };
  tasks: { name: string; command: string; status: string; pid: number | null }[];
  ee_position?: EePosition | null;
  gripper?: { width_mm: number | null } | null;
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

// Either `z` (explicit cup-top centre) or `cupCount` (N nested cups → ROS 2
// computes Z server-side) must be set. Cup-geometry constants intentionally
// live in `cup_stack/skills/config.py`, not here.
interface PickArgs { x: number; y: number; z?: number; cupCount?: number }

// Parses, in order of preference:
//   pick -x X -y Y -z Z         → explicit cup-top Z
//   pick -x X -y Y --cup N      → ROS 2 derives Z from N nested cups
//   pick -x X -y Y              → defaults to --cup 1
//   pick X Y Z                  → legacy positional form (explicit Z)
//   pick X Y                    → positional shorthand, equivalent to --cup 1
function parsePickArgs(cmd: string): PickArgs | null {
  const flagMode = /(?:^|\s)(?:-x|-y|-z|--cup)\b/i.test(cmd);
  if (flagMode) {
    const num = (re: RegExp) => {
      const m = cmd.match(re);
      return m ? Number(m[1]) : NaN;
    };
    const x = num(/(?:^|\s)-x\s+(-?\d+(?:\.\d+)?)/i);
    const y = num(/(?:^|\s)-y\s+(-?\d+(?:\.\d+)?)/i);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    const zExp = num(/(?:^|\s)-z\s+(-?\d+(?:\.\d+)?)/i);
    if (!Number.isNaN(zExp)) return { x, y, z: zExp };
    const cupM = cmd.match(/(?:^|\s)--cup(?:\s+(\d+))?/i);
    const n = cupM ? (cupM[1] ? Number(cupM[1]) : 1) : 1;
    if (n < 1) return null;
    return { x, y, cupCount: n };
  }
  const nums = (cmd.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length >= 3) return { x: nums[0], y: nums[1], z: nums[2] };
  if (nums.length === 2) return { x: nums[0], y: nums[1], cupCount: 1 };
  return null;
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: now(), level: 'INFO', msg: 'Dashboard loaded — connecting to server…' },
  ]);
  const [joints, setJoints] = useState<number[]>(DEFAULT_JOINTS);
  const [gripperMm, setGripperMm] = useState<number | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('idle');
  const [cycleIdx] = useState(0);
  const [bringupActive, setBringupActive] = useState(false);
  const [robotOnline, setRobotOnline] = useState(false);
  const [robotIp, setRobotIp] = useState('192.168.1.100');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'live' | 'lost'>('connecting');
  const [lastDataTime, setLastDataTime] = useState<number>(0);
  const [eePosition, setEePosition] = useState<EePosition | null>(null);
  // exo = eye-to-hand (fixed/external camera) · hand = eye-in-hand (EE-mounted)
  const [cameraView, setCameraView] = useState<'both' | 'exo' | 'hand'>('both');
  const [baseUrl, setBaseUrlState] = useState(() => getBaseUrl());
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

    // Online only when joints AND a fresh EE pose are present. The server
    // nulls ee_position once /ee_pose (TF) is stale (>1s) — i.e. bringup
    // terminated or data not received — so joint state / end-effector then
    // render as 연결 안됨. (Works for external bringup too: it publishes
    // /tf or /ee_pose.) A total WS silence is still caught by the 2s timer.
    const hasJoints = (data.joints?.position?.length ?? 0) > 0;
    setRobotOnline(hasJoints && !!data.ee_position);
    setEePosition(data.ee_position ?? null);
    setGripperMm(data.gripper?.width_mm ?? null);

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
      // External bringup (robotOnline but not dashboard-tracked) is
      // stoppable from here too; start only when nothing is running.
      if (bringupActive || robotOnline) {
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

  // ── Command handler ──
  // Pick-one runs purely from the command box (no camera/pixel needed):
  //   pick -x X -y Y -z Z      → cup top-centre Z (base_link, m)
  //   pick -x X -y Y --cup N   → ROS 2 derives Z from N nested cups (default 1)
  //   pick X Y Z               → positional, explicit Z
  //   pick X Y                 → positional shorthand, --cup 1
  const handleCommand = useCallback(async (cmd: string) => {
    addLog('INFO', `> ${cmd}`);

    if (!/pick/i.test(cmd)) {
      addLog('WARN', `Unknown command: "${cmd}" — try "pick -x X -y Y -z Z" 또는 "pick -x X -y Y --cup N"`);
      return;
    }

    const args = parsePickArgs(cmd);
    if (!args) {
      addLog('WARN', 'Usage: pick -x X -y Y [-z Z | --cup N]  ·  pick X Y [Z] — base_link, m');
      return;
    }
    if (!wsConnected || !robotOnline) {
      addLog('WARN', 'Robot must be online to pick a cup');
      return;
    }

    const { x, y, z, cupCount } = args;
    const tail = cupCount !== undefined
      ? `--cup ${cupCount} (Z auto by ROS 2)`
      : `z=${z!.toFixed(3)}`;
    addLog('INFO', `Picking cup at (${x.toFixed(3)}, ${y.toFixed(3)}) [${tail}]…`);
    setTaskStatus('executing');
    try {
      const r = await pickOne(x, y,
        cupCount !== undefined ? { nestedCount: cupCount } : { cupTopZ: z! });
      if (r.success) addLog('OK', `Pick complete — ${r.detail}`);
      else addLog('ERR', `Pick failed — ${r.detail}`);
    } catch (e) {
      addLog('ERR', `Pick error: ${(e as Error).message}`);
    } finally {
      setTaskStatus('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected, robotOnline]);

  function handleChangeBaseUrl(url: string) {
    setBaseUrl(url);
    setBaseUrlState(url);
    window.location.reload();
  }

  function handleAbort() {
    setTaskStatus('error');
    addLog('ERR', 'Aborted by operator');
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
        baseUrl={baseUrl}
        rightPanelOpen={rightPanelOpen}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        onToggleRightPanel={() => setRightPanelOpen(o => !o)}
        onAbort={handleAbort}
        onToggleBringup={toggleBringup}
        onChangeRobotIp={setRobotIp}
        onChangeBaseUrl={handleChangeBaseUrl}
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
                taskStatus={taskStatus}
                cycleIdx={cycleIdx}
                totalCycles={totalCycles}
                connected={robotOnline}
                eePosition={eePosition}
              />
              <ManualControl
                disabled={isRunning}
                eePosition={eePosition}
                gripperMm={gripperMm}
                connected={robotOnline}
              />
            </div>
          </>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="dashboard-main">
        {/* Camera row — fills all available height */}
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0, position: 'relative' }}>
          {cameraView !== 'hand' && (
            <CameraPanel
              title="exo"
              topic="/exo/exo/color/image_raw"
              isActive={wsConnected}
              isLive={wsConnected}
              streamUrl="/ws/camera/exo"
            />
          )}
          {cameraView !== 'exo' && (
            <CameraPanel
              title="hand"
              topic="/hand/hand/color/image_raw"
              isActive={wsConnected}
              isLive={wsConnected}
              streamUrl="/ws/camera/hand"
              objectFit="contain"
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
              { key: 'exo', label: 'exo', icon: (
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                  <rect x="0.5" y="0.5" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <rect x="10.5" y="0.5" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1"/>
                </svg>
              )},
              { key: 'hand', label: 'hand', icon: (
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
