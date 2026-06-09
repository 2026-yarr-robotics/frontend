import { useState, useCallback, useEffect, useRef } from 'react';
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
import {
  startBringup, stopBringup, stopTask, pickOne,
  getPyramidConfig, setPyramidConfig, pyramidSkill, scanSkill, scanSquareSkill, getWorkspaceLimits,
  getFallenCupState, recoverFallenCup,
  startFallenCupDetection, stopFallenCupDetection,
  sendUserCommand, moveRobot,
  getBaseUrl, setBaseUrl,
  type EePosition, type PyramidSlot,
} from './api';

const PYRAMID_SLOT_KEYS: readonly PyramidSlot[] = ['1l', '1m', '1r', '2l', '2r', '3m'];

// `/help` output — every direct (slash) command with a short description.
// Plain text (no leading "/") is NOT a slash command: it is forwarded to the
// LLM agent loop via the `/user_command` ROS topic.
const SLASH_HELP: readonly string[] = [
  'Slash commands (leading "/" required):',
  '  /pick [N] | /pick -x X -y Y [-z Z | --cup N] | /pick X Y [Z] — 컵 집기 (base_link, m)',
  '  /pyramid <slot> [x y] — 단일 컵 pick→place · slot: 1l 1m 1r 2l 2r 3m',
  '  /scan [line|square] — 2방향 라인 / 4방향 사각형 스캔',
  '  /move home — 로봇을 HOME(park) 위치로 이동 (0.45, 0, 0.45)',
  '  /fallen state — 넘어진 컵 인식 상태 조회',
  '  /fallen detect [start|stop] — 넘어진 컵 YOLO 인식 서비스 on/off',
  '  /fallen recovery [drop|place] [--single] [--dry] [--sim] — 넘어진 컵 세우기',
  '  /config pyramid [center x y | degree d | pick_z z] — 피라미드 설정 조회/변경',
  '  /config workspace — 워크스페이스 한계 조회',
  '  /help — 이 명령어 목록',
  'Plain text (no "/") → LLM 에이전트로 전송 (/user_command)',
];

function isPyramidSlot(s: string): s is PyramidSlot {
  return (PYRAMID_SLOT_KEYS as readonly string[]).includes(s);
}

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

interface AgentLogLine {
  ts: number;
  node: string;
  level: string;
  text: string;
}

interface AgentLog {
  run_id: string | null;
  lines: AgentLogLine[];
}

// rclpy log levels → LogFeed levels.
function agentLevel(level: string): LogLevel {
  const l = level.toUpperCase();
  if (l === 'ERROR' || l === 'FATAL' || l === 'CRITICAL') return 'ERR';
  if (l === 'WARN' || l === 'WARNING') return 'WARN';
  return 'INFO';
}

// Drop the "_node" suffix so the tag stays compact (e.g. "plan_executor").
function shortNode(node: string): string {
  return node.replace(/_node$/, '');
}

function now(): string {
  return new Date().toTimeString().slice(0, 8);
}

const DEFAULT_JOINTS = [0, -30, 90, 0, 90, 0];

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
  const [taskName, setTaskName] = useState<string | null>(null);
  // Timestamp of last user abort. While the server reconciles, ignore
  // stale `running` from WS to prevent the executing↔idle bounce.
  const abortGuardRef = useRef<number>(0);
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

    setTaskName(data.task?.name ?? null);

    const taskSt = data.task?.status;
    // Abort guard: within 2s of a user abort, ignore stale `running`
    // pushed before the server has reconciled the stop request.
    const recentlyAborted = Date.now() - abortGuardRef.current < 2000;
    if (taskSt === 'running' && !recentlyAborted) setTaskStatus('executing');
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
  // Log-only: task status is owned by `/ws/robot/state` to avoid the
  // executing↔idle bounce when log replays carry `status: 'running'`
  // while robot/state already reports `idle`.
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
  }, []);

  useJsonWebSocket<TaskLog>('/ws/task/log', handleTaskLog);

  // ── WebSocket: agent (cup_stack_agent) LLM-loop logs ──
  // Streamed from the host bringup-agent's cup_stack_agent/logs/<RUN_ID>/*.log
  // via the server's /ws/agent/log proxy. Lines are tagged with their source
  // node ("[agent:llm] …") so the operator can tell the agent's reasoning/
  // actions apart from command-response logs.
  const agentRunRef = useRef<string | null>(null);
  const handleAgentLog = useCallback((data: AgentLog) => {
    const incoming = data.lines ?? [];
    const entries: LogEntry[] = [];
    if (data.run_id && data.run_id !== agentRunRef.current) {
      if (agentRunRef.current !== null) {
        entries.push({ time: now(), level: 'INFO', msg: `── agent run ${data.run_id} ──` });
      }
      agentRunRef.current = data.run_id;
    }
    for (const line of incoming) {
      entries.push({
        time: now(),
        level: agentLevel(line.level),
        msg: `[agent:${shortNode(line.node)}] ${line.text}`,
      });
    }
    if (entries.length) setLogs(prev => [...prev, ...entries].slice(-300));
  }, []);

  useJsonWebSocket<AgentLog>('/ws/agent/log', handleAgentLog);

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
  // Routing by leading slash:
  //   "/<cmd> …"  → direct robot command (slash commands below).
  //   "<text>"    → forwarded to the LLM agent via the /user_command ROS topic.
  //
  // Direct (slash) commands — pick runs purely from the command box:
  //   /pick                     → current EE xy, --cup 1
  //   /pick N                   → current EE xy, --cup N
  //   /pick -x X -y Y -z Z      → cup top-centre Z (base_link, m)
  //   /pick -x X -y Y --cup N   → ROS 2 derives Z from N nested cups (default 1)
  //   /pick X Y Z               → positional, explicit Z
  //   /pick X Y                 → positional shorthand, --cup 1
  //   /pyramid /scan /fallen /config …  (see SLASH_HELP / `/help`)
  const handleCommand = useCallback(async (cmd: string) => {
    addLog('INFO', `> ${cmd}`);

    const raw = cmd.trim();

    // Plain text (no leading "/") → LLM agent loop via /user_command.
    if (!raw.startsWith('/')) {
      addLog('INFO', `agent ← ${raw}`);
      try {
        const r = await sendUserCommand(raw);
        addLog('OK', `agent: ${r.message}`);
      } catch (e) {
        addLog('ERR', `agent command failed: ${(e as Error).message}`);
      }
      return;
    }

    // Slash command — strip the leading "/" and dispatch a direct robot command.
    const norm = raw.replace(/^\/+/, '');
    const tokens = norm.split(/\s+/);

    // ── /help — list every slash command ─────────────────────────────
    if (!norm || /^help\b/i.test(norm)) {
      for (const line of SLASH_HELP) addLog('INFO', line);
      return;
    }

    // ── move home — cartesian park pose (mirrors ManualControl HOME) ──
    // /move home → 기존 ManualControl HOME 버튼과 동일한 park pose 로 이동한다.
    // joint move_home 서비스가 아니라 /move(move_line) 사용 (서버에 /home 엔드포인트
    // 없음 — ManualControl.tsx HOME_POSE 주석 참고).
    if (/^move\b/i.test(norm)) {
      const target = (tokens[1] || '').toLowerCase();
      if (target !== 'home') {
        addLog('WARN', 'usage: /move home');
        return;
      }
      const HOME = { x: 0.45, y: 0.0, z: 0.45 };
      addLog('INFO', `move → HOME (${HOME.x}, ${HOME.y}, ${HOME.z})`);
      try {
        const r = await moveRobot(HOME.x, HOME.y, HOME.z, 'absolute');
        addLog('OK', `move home: ${r.message ?? 'done'}`);
      } catch (e) {
        addLog('ERR', `move home failed: ${(e as Error).message}`);
      }
      return;
    }

    // ── config workspace ─────────────────────────────────────────────
    if (/^config\s+workspace\b/i.test(norm)) {
      try {
        const w = await getWorkspaceLimits();
        addLog('OK',
          `workspace x[${w.x_min.toFixed(2)},${w.x_max.toFixed(2)}] ` +
          `y[${w.y_min.toFixed(2)},${w.y_max.toFixed(2)}] ` +
          `z[${w.z_min.toFixed(2)},${w.z_max.toFixed(2)}] grid=${w.grid_spacing}`,
        );
      } catch (e) {
        addLog('ERR', `config workspace: ${(e as Error).message}`);
      }
      return;
    }

    // ── config pyramid [center <x> <y> | degree <d> | pick_z <z>] ────
    if (/^config\s+pyramid\b/i.test(norm)) {
      const sub = tokens[2];   // undefined → GET
      try {
        if (!sub) {
          const c = await getPyramidConfig();
          addLog('OK',
            `pyramid center=(${c.center.x.toFixed(3)},${c.center.y.toFixed(3)}) ` +
            `degree=${c.degree.toFixed(1)} pick_z=${c.pick_z.toFixed(3)}`,
          );
          for (const k of PYRAMID_SLOT_KEYS) {
            const s = c.slots[k];
            addLog('INFO',
              `  ${k}: (${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)})`,
            );
          }
        } else if (sub === 'center') {
          const x = Number(tokens[3]);
          const y = Number(tokens[4]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            addLog('WARN', 'usage: /config pyramid center <x> <y>');
            return;
          }
          const c = await setPyramidConfig({ center: { x, y } });
          addLog('OK', `center=(${c.center.x.toFixed(3)},${c.center.y.toFixed(3)})`);
        } else if (sub === 'degree') {
          const d = Number(tokens[3]);
          if (!Number.isFinite(d)) {
            addLog('WARN', 'usage: /config pyramid degree <deg>');
            return;
          }
          const c = await setPyramidConfig({ degree: d });
          addLog('OK', `degree=${c.degree.toFixed(1)}`);
        } else if (sub === 'pick_z') {
          const z = Number(tokens[3]);
          if (!Number.isFinite(z)) {
            addLog('WARN', 'usage: /config pyramid pick_z <z>');
            return;
          }
          const c = await setPyramidConfig({ pick_z: z });
          addLog('OK', `pick_z=${c.pick_z.toFixed(3)}`);
        } else {
          addLog('WARN', 'usage: /config pyramid [center <x> <y> | degree <d> | pick_z <z>]');
        }
      } catch (e) {
        addLog('ERR', `config pyramid: ${(e as Error).message}`);
      }
      return;
    }

    // ── pyramid <slot> [x y] ─────────────────────────────────────────
    // x y 생략 시 현재 EE xy 를 pick 좌표로 사용 (pick 명령과 동일 동작).
    if (/^pyramid\b/i.test(norm)) {
      const slot = tokens[1];
      if (!slot || !isPyramidSlot(slot)) {
        addLog('WARN', 'usage: /pyramid <1l|1m|1r|2l|2r|3m> [x y]');
        return;
      }
      let x: number;
      let y: number;
      if (tokens.length >= 4) {
        x = Number(tokens[2]);
        y = Number(tokens[3]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          addLog('WARN', 'usage: /pyramid <slot> [x y] — x, y must be numbers');
          return;
        }
      } else {
        if (!eePosition) {
          addLog('WARN', 'pyramid: current EE position not available yet');
          return;
        }
        x = eePosition.x;
        y = eePosition.y;
      }
      if (!wsConnected || !robotOnline) {
        addLog('WARN', 'Robot must be online to run pyramid skill');
        return;
      }
      addLog('INFO', `pyramid slot=${slot} pick=(${x.toFixed(3)}, ${y.toFixed(3)})…`);
      setTaskStatus('executing');
      try {
        const r = await pyramidSkill(x, y, slot);
        if (r.success) addLog('OK', `pyramid complete — ${r.detail}`);
        else addLog('ERR', `pyramid failed — ${r.detail}`);
      } catch (e) {
        addLog('ERR', `pyramid error: ${(e as Error).message}`);
      } finally {
        setTaskStatus('idle');
      }
      return;
    }

    // ── scan [line|square] ───────────────────────────────────────────
    // scan / scan line → 2방향: pos1 → pos2 → 초기 위치 PTP, 각 웨이포인트
    //                    도달 후 dwell 대기.
    // scan square      → 4방향 사각형: 카메라 하향 고정, base_link XY 사각형
    //                    네 꼭짓점(HOME EE 높이) 순회 후 시작 위치 복귀.
    const scanMatch = norm.match(/^scan(?:\s+(line|square))?\s*$/i);
    if (scanMatch) {
      const isSquare = (scanMatch[1] ?? 'line').toLowerCase() === 'square';
      const label = isSquare ? 'scan square' : 'scan line';
      if (!wsConnected || !robotOnline) {
        addLog('WARN', 'Robot must be online to run scan skill');
        return;
      }
      addLog('INFO', `${label}…`);
      setTaskStatus('executing');
      try {
        const r = isSquare ? await scanSquareSkill() : await scanSkill();
        if (r.success) addLog('OK', `${label} complete${r.detail ? ` — ${r.detail}` : ''}`);
        else addLog('ERR', `${label} failed${r.detail ? ` — ${r.detail}` : ''}`);
      } catch (e) {
        addLog('ERR', `${label} error: ${(e as Error).message}`);
      } finally {
        setTaskStatus('idle');
      }
      return;
    }

    // ── fallen <state|recovery> ──────────────────────────────────────
    // fallen state        → 인식 실행 여부 + 최근 인식 결과
    // fallen recovery [drop|place] [--single] [--dry] [--sim]  (기본 multi-cup)
    //                     → 컵 세우기 태스크 (fallen_cup_recovery launch).
    //                       진행/로그는 WS가 자동 표시, 중지는 Abort 버튼.
    if (/^fallen\b/i.test(norm)) {
      const sub = (tokens[1] ?? '').toLowerCase();

      if (sub === 'state') {
        try {
          const s = await getFallenCupState();
          addLog('OK',
            `detection=${s.detection_running ? 'running' : 'stopped'} · ` +
            `fallen cups=${s.count} · ` +
            `grasp_pose=${s.grasp_pose ? 'fresh' : 'none'}`,
          );
          for (const c of s.cups) {
            const pos = c.position
              ? `(${c.position.x.toFixed(3)}, ${c.position.y.toFixed(3)}, ${c.position.z.toFixed(3)})`
              : 'no depth';
            addLog('INFO',
              `  cup ${c.cup_id}: yaw=${(c.yaw * 180 / Math.PI).toFixed(1)}° ` +
              `conf=${c.confidence.toFixed(2)} pos=${pos}`,
            );
          }
        } catch (e) {
          addLog('ERR', `fallen state: ${(e as Error).message}`);
        }
        return;
      }

      if (sub === 'detect' || sub === 'detection') {
        // fallen detect [start|stop] → YOLO 인식 서비스(fallen_cup_detect) on/off.
        const action = (tokens[2] ?? 'start').toLowerCase();
        if (action === 'start') {
          try {
            const r = await startFallenCupDetection();
            addLog('OK', `fallen detection started (${r.name}: ${r.status})`);
          } catch (e) {
            addLog('ERR', `fallen detect start: ${(e as Error).message}`);
          }
        } else if (action === 'stop') {
          try {
            const r = await stopFallenCupDetection();
            addLog('OK', `fallen detection stopped (${r.name}: ${r.status})`);
          } catch (e) {
            addLog('ERR', `fallen detect stop: ${(e as Error).message}`);
          }
        } else {
          addLog('WARN', 'usage: /fallen detect [start|stop]');
        }
        return;
      }

      if (sub === 'recovery' || sub === 'recover') {
        const mode = tokens[2] && /^(drop|place)$/i.test(tokens[2])
          ? tokens[2].toLowerCase() as 'drop' | 'place'
          : 'drop';
        // 기본 multi-cup. --single 로 단일 컵만 처리.
        const multiCup = !/--single\b/i.test(norm);
        const dryRun = /--dry\b/i.test(norm);
        const sim = /--sim\b/i.test(norm);
        if (!sim && (!wsConnected || !robotOnline)) {
          addLog('WARN', 'Robot must be online to run fallen-cup recovery');
          return;
        }
        addLog('INFO',
          `fallen recovery mode=${mode}` +
          `${multiCup ? '' : ' --single'}${dryRun ? ' --dry' : ''}${sim ? ' --sim' : ''}…`,
        );
        setTaskStatus('executing');
        try {
          const r = await recoverFallenCup({ mode, multiCup, dryRun, sim });
          addLog('OK', `fallen recovery started (${r.name}: ${r.status}) — 진행 상황은 로그 피드 참조`);
          // 1회 실행 launch 태스크: 상태/로그는 /ws/robot/state · /ws/task/log 가
          // 소유한다 (bringup 패턴). 여기서 idle 로 되돌리지 않음.
        } catch (e) {
          addLog('ERR', `fallen recovery: ${(e as Error).message}`);
          setTaskStatus('idle');
        }
        return;
      }

      addLog('WARN',
        'usage: /fallen state  ·  /fallen detect [start|stop]  ·  ' +
        '/fallen recovery [drop|place] [--single] [--dry] [--sim]',
      );
      return;
    }

    // pick [N] — use the live EE xy from the WS status stream as the
    // pick target. Useful for "pick whatever the arm is hovering over".
    const barePick = norm.match(/^pick(?:\s+(\d+))?\s*$/i);
    if (barePick) {
      const n = barePick[1] ? Number(barePick[1]) : 1;
      if (n < 1) {
        addLog('WARN', 'pick N: N must be >= 1');
        return;
      }
      if (!wsConnected || !robotOnline) {
        addLog('WARN', 'Robot must be online to pick a cup');
        return;
      }
      if (!eePosition) {
        addLog('WARN', 'pick: current EE position not available yet');
        return;
      }
      const { x, y } = eePosition;
      addLog('INFO', `Picking cup at current EE (${x.toFixed(3)}, ${y.toFixed(3)}) [--cup ${n}]…`);
      setTaskStatus('executing');
      try {
        const r = await pickOne(x, y, { nestedCount: n });
        if (r.success) addLog('OK', `Pick complete — ${r.detail}`);
        else addLog('ERR', `Pick failed — ${r.detail}`);
      } catch (e) {
        addLog('ERR', `Pick error: ${(e as Error).message}`);
      } finally {
        setTaskStatus('idle');
      }
      return;
    }

    if (!/^pick\b/i.test(norm)) {
      addLog('WARN',
        `Unknown slash command: "${cmd}" — type /help for the list. ` +
        `(Plain text without "/" is sent to the LLM agent.)`,
      );
      return;
    }

    const args = parsePickArgs(norm);
    if (!args) {
      addLog('WARN', 'Usage: pick [N]  ·  pick -x X -y Y [-z Z | --cup N]  ·  pick X Y [Z] — base_link, m');
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
  }, [wsConnected, robotOnline, eePosition]);

  function handleChangeBaseUrl(url: string) {
    setBaseUrl(url);
    setBaseUrlState(url);
    window.location.reload();
  }

  async function handleAbort() {
    // Engage guard first so the next WS tick can't bounce us back to
    // `executing` before the server has processed the stop.
    abortGuardRef.current = Date.now();
    setTaskStatus('idle');
    const name = taskName;
    if (!name) {
      addLog('WARN', 'Abort: no active task name known to the server');
      return;
    }
    addLog('WARN', `Aborting task: ${name}…`);
    try {
      await stopTask(name);
      addLog('OK', `Aborted: ${name}`);
    } catch (e) {
      addLog('ERR', `Abort failed: ${(e as Error).message}`);
    }
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
