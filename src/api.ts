const LS_KEY = 'cup_api_base';

export function getBaseUrl(): string {
  return localStorage.getItem(LS_KEY)
    ?? (import.meta.env.VITE_API_BASE_URL as string | undefined)
    ?? 'https://yarr-api-31.simplyimg.com';
}

export function setBaseUrl(url: string) {
  if (url) localStorage.setItem(LS_KEY, url);
  else localStorage.removeItem(LS_KEY);
}

async function post<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

export async function startBringup(ip = '192.168.1.100') {
  return post('/api/robot/bringup', { mode: 'real', ip });
}

export async function stopBringup() {
  return post('/api/robot/task/stop', { name: 'bringup_real' });
}

export async function startTask(task: string, args: Record<string, string> = {}) {
  return post('/api/robot/task/start', { task, args });
}

export async function stopTask(name: string) {
  return post('/api/robot/task/stop', { name });
}

export interface StopAllResult {
  success: boolean;
  ros_stop: boolean;
  interrupted: boolean;
  killed_tasks: string[];
  homed: boolean;
  detail: string;
}

// 통합 정지(패닉/abort): 무엇이 돌고 있든 즉시 멈추고 HOME 복귀.
// 동기 skill(pyramid/unstack)·action task 모두 한 호출로 멈춘다 — 대상
// 이름이 필요 없다(`task/stop` 과 다른 점). HOME 이동까지 ~수십초 걸릴 수 있다.
export async function stopAll(home = true) {
  return post<StopAllResult>('/api/robot/stop', { home });
}

export interface WorkspaceLimits {
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  z_min: number;
  z_max: number;
  grid_spacing: number;
}

export async function getWorkspaceLimits(): Promise<WorkspaceLimits> {
  return get('/api/robot/config/workspace');
}

export interface EePosition {
  x: number;
  y: number;
  z: number;
}

export interface MoveResponse {
  success?: boolean;
  message?: string;
  position?: EePosition;
}

export async function getEePosition(): Promise<EePosition> {
  return get('/api/robot/position');
}

export async function gripperControl(command: 'open' | 'close'): Promise<{ success?: boolean; message?: string }> {
  return post('/api/robot/gripper', { command });
}

export async function moveRobot(
  x: number, y: number, z: number,
  mode: 'absolute' | 'relative' = 'absolute',
): Promise<MoveResponse> {
  return post<MoveResponse>('/api/robot/move', { x, y, z, mode });
}

export interface UserCommandResponse {
  success: boolean;
  message: string;
}

/**
 * Forward a natural-language command to the LLM agent loop. The server
 * publishes the text on the ROS topic `/user_command` (`std_msgs/String`),
 * consumed by goal_state_publisher → llm_node. This is the path for plain
 * text typed in the command box (no leading `/`).
 */
export async function sendUserCommand(text: string): Promise<UserCommandResponse> {
  return post<UserCommandResponse>('/api/robot/command', { text });
}

export interface WorldCoord {
  x: number;
  y: number;
  z: number;
  depth_mm: number;
  pixel_x: number;
  pixel_y: number;
}

export async function pixelToWorld(px: number, py: number): Promise<WorldCoord> {
  return get<WorldCoord>(`/api/robot/pixel-to-world?px=${px}&py=${py}`);
}

export interface PickSkillResponse {
  success: boolean;
  skill: string;
  detail: string;
}

export interface PickOptions {
  /** Cup top-centre Z (base_link, m). Server adds cup_grip_z_offset. */
  cupTopZ?: number;
  /** Number of nested cups in the source stack; ROS 2 derives the Z. */
  nestedCount?: number;
  /**
   * Cups remaining in the source nest (1 = bottom/last). Same semantics as
   * `nestedCount` but defaults to 1; used when none of cupTopZ / nestedCount
   * is supplied. Matches the pyramid/unstack `nested` param.
   */
  nested?: number;
  ori?: { x: number; y: number; z: number; w: number };
}

/**
 * Pick one cup at base_link (x, y). Supply `cupTopZ` (cup-top centre Z) or
 * `nestedCount` (nested cups in the source stack); if neither is given the
 * request defaults to `nested: 1`. The cup-stack geometry constants live in
 * ROS 2 (`cup_stack.skills.config.SkillStackConfig`), not the frontend.
 */
export async function pickOne(
  x: number,
  y: number,
  opts: PickOptions,
): Promise<PickSkillResponse> {
  const hasZ = (opts as { z?: number }).z !== undefined;
  const defaultsNested =
    opts.cupTopZ === undefined && opts.nestedCount === undefined && !hasZ;
  return post<PickSkillResponse>('/api/robot/skill/pick', {
    x, y,
    ...(opts.cupTopZ !== undefined ? { cup_top_z: opts.cupTopZ } : {}),
    ...(opts.nestedCount !== undefined ? { nested_count: opts.nestedCount } : {}),
    ...(opts.nested !== undefined ? { nested: opts.nested }
      : defaultsNested ? { nested: 1 } : {}),
    ...(opts.ori ? { ori: opts.ori } : {}),
  });
}

// ── Pyramid skill ─────────────────────────────────────────────────────────

export type PyramidSlot = '1l' | '1m' | '1r' | '2l' | '2r' | '3m';

export interface PyramidConfigCenter { x: number; y: number; }
export interface PyramidSlotXYZ { x: number; y: number; z: number; }

export interface PyramidConfig {
  center: PyramidConfigCenter;
  degree: number;
  pick_z: number;
  slots: Record<PyramidSlot, PyramidSlotXYZ>;
}

export interface PyramidConfigUpdate {
  center?: PyramidConfigCenter;
  degree?: number;
  pick_z?: number;
}

export interface PyramidSkillResponse {
  success: boolean;
  skill: string;
  detail: string;
}

export async function getPyramidConfig(): Promise<PyramidConfig> {
  return get<PyramidConfig>('/api/robot/config/pyramid');
}

export async function setPyramidConfig(update: PyramidConfigUpdate): Promise<PyramidConfig> {
  return post<PyramidConfig>('/api/robot/config/pyramid', update);
}

/**
 * Build: pick a cup from the source nest at (x, y) and place it into pyramid
 * `slot`. `nested` = cups remaining in the source nest (1 = bottom/last); the
 * pick Z rises with it. Defaults to 1 → identical to the pre-nested behaviour.
 */
export async function pyramidSkill(
  x: number, y: number, slot: PyramidSlot, nested = 1,
): Promise<PyramidSkillResponse> {
  return post<PyramidSkillResponse>('/api/robot/skill/pyramid', { x, y, slot, nested });
}

// ── Unstack skill ─────────────────────────────────────────────────────────

export interface UnstackSkillResponse {
  success: boolean;
  skill: string;
  detail: string;
}

/**
 * Inverse of pyramidSkill: pick the cup in a pyramid `slot` (pick XY/Z come
 * from the server's /config/pyramid cache) and nest it at destination (x, y).
 * `nested` is the destination column height after this cup (1 = first/bottom);
 * release Z grows with it. Unstack top-down: 3m → 2r → 2l → 1r → 1m → 1l.
 */
export async function unstackSkill(
  slot: PyramidSlot, x: number, y: number, nested: number,
): Promise<UnstackSkillResponse> {
  return post<UnstackSkillResponse>('/api/robot/skill/unstack', { slot, x, y, nested });
}

// ── Unstack-all (full teardown) skill ───────────────────────────────────────

export interface UnstackAllStep {
  slot: PyramidSlot;
  nested: number;
  success: boolean;
  attempts: number;
  detail: string;
}

export interface UnstackAllSkillResponse {
  success: boolean;
  skill: string;
  dest: { x: number; y: number };
  total: number;
  /** Cups successfully torn down and nested (0–6). */
  completed: number;
  detail: string;
  steps: UnstackAllStep[];
}

/**
 * Full pyramid teardown — server-side port of `script/unstack.sh`. Walks
 * 3m → 2r → 2l → 1r → 1m → 1l, raising the destination column height from 1 to
 * 6 so all six cups nest at (x, y). The server retries transient per-step
 * failures; a step that fails after all retries stops the sequence and returns
 * `success: false` with `completed` set (no exception). This is a single
 * long-running request (~minutes); the response carries per-step results.
 */
export async function unstackAllSkill(
  x = 0.4, y = 0.1,
): Promise<UnstackAllSkillResponse> {
  return post<UnstackAllSkillResponse>('/api/robot/skill/unstack_all', { x, y });
}

// ── Scan skill ────────────────────────────────────────────────────────────

export interface ScanSkillResponse {
  success: boolean;
  skill: string;
  detail: string;
}

export async function scanSkill(): Promise<ScanSkillResponse> {
  return post<ScanSkillResponse>('/api/robot/skill/scan', {});
}

// 4방향 사각형 스캔 — 카메라 하향 고정, base_link XY 사각형 4 꼭짓점 순회.
export async function scanSquareSkill(): Promise<ScanSkillResponse> {
  return post<ScanSkillResponse>('/api/robot/skill/scan_square', {});
}

// ── Fallen cup ────────────────────────────────────────────────────────────
// fallen-cup-recovery 통합: YOLO 인식(상시 서비스) + 컵 세우기(1회 태스크).

export interface FallenCupItem {
  cup_id: number;
  yaw: number;
  grip_pixel: { x: number; y: number };
  confidence: number;
  /** 카메라 optical frame 3D 좌표; depth 실패 시 null */
  position: EePosition | null;
}

export interface FallenCupState {
  detection_running: boolean;
  count: number;
  cups: FallenCupItem[];
  pose2d: {
    top: { x: number; y: number };
    bottom: { x: number; y: number };
    direction: { x: number; y: number };
    yaw: number;
    grip: { x: number; y: number };
    confidence: number;
    top_width: number;
    bottom_width: number;
  } | null;
  grasp_pose: {
    frame_id: string;
    position: EePosition;
    orientation: { x: number; y: number; z: number; w: number };
  } | null;
}

export interface TaskStartedResponse {
  name: string;
  status: string;
  pid: number | null;
}

export async function getFallenCupState(): Promise<FallenCupState> {
  return get<FallenCupState>('/api/robot/fallen-cup/state');
}

export interface FallenRecoveryOptions {
  /** drop: 그 자리에 놓기 / place: 작업공간으로 옮겨 세우기 */
  mode?: 'drop' | 'place';
  multiCup?: boolean;
  dryRun?: boolean;
  sim?: boolean;
}

// 넘어진 컵 세우기 태스크 시작 (1회 실행 후 종료).
// 진행 상황은 /ws/task/log · /ws/robot/state 로 모니터링.
// 중지는 stopTask('fallen_cup_recovery').
export async function recoverFallenCup(
  opts: FallenRecoveryOptions = {},
): Promise<TaskStartedResponse> {
  return post<TaskStartedResponse>('/api/robot/fallen-cup/recovery', {
    mode: opts.mode ?? 'drop',
    multi_cup: opts.multiCup ?? false,
    dry_run: opts.dryRun ?? false,
    sim: opts.sim ?? false,
  });
}

export interface OutlierRecoveryOptions {
  /** fallen lift 후 동작: drop(그 자리) / place(옮겨 세우기) · mouth-up 단계와 무관 */
  mode?: 'drop' | 'place';
  dryRun?: boolean;
  sim?: boolean;
}

// outlier 컵 복구 오케스트레이터 태스크 시작 (1회 실행 후 종료):
// fallen cup 을 전부 세운 뒤 mouth-up cup 을 전부 뒤집는 상위 집합 스킬.
// multi-cup 은 오케스트레이터가 강제 ON 이라 노출하지 않는다.
// 진행 상황은 /ws/task/log · /ws/robot/state 로 모니터링.
// 중지는 stopTask('outlier_cup_recovery').
export async function recoverOutlierCup(
  opts: OutlierRecoveryOptions = {},
): Promise<TaskStartedResponse> {
  return post<TaskStartedResponse>('/api/robot/outlier-cup/recovery', {
    mode: opts.mode ?? 'drop',
    dry_run: opts.dryRun ?? false,
    sim: opts.sim ?? false,
  });
}

export interface FallenDetectionOptions {
  conf?: number;
  imgsz?: number;
  useDepth?: boolean;
  weightsPath?: string;
}

// 넘어진 컵 YOLO 인식 서비스(상시) 시작 — 생략한 필드는 서버 기본값.
export async function startFallenCupDetection(
  opts: FallenDetectionOptions = {},
): Promise<TaskStartedResponse> {
  const body: Record<string, unknown> = {};
  if (opts.conf !== undefined) body.conf = opts.conf;
  if (opts.imgsz !== undefined) body.imgsz = opts.imgsz;
  if (opts.useDepth !== undefined) body.use_depth = opts.useDepth;
  if (opts.weightsPath !== undefined) body.weights_path = opts.weightsPath;
  return post<TaskStartedResponse>('/api/robot/fallen-cup/detection/start', body);
}

// 넘어진 컵 인식 서비스 중지 (로봇 모션 정지 없음).
export async function stopFallenCupDetection(): Promise<{ name: string; status: string }> {
  return post<{ name: string; status: string }>('/api/robot/fallen-cup/detection/stop', {});
}
