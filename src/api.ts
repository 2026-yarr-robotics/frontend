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
  ori?: { x: number; y: number; z: number; w: number };
}

/**
 * Pick one cup at base_link (x, y). Caller must supply either `cupTopZ`
 * or `nestedCount` — the cup-stack geometry constants live in ROS 2
 * (`cup_stack.skills.config.SkillStackConfig`), not the frontend.
 */
export async function pickOne(
  x: number,
  y: number,
  opts: PickOptions,
): Promise<PickSkillResponse> {
  if (opts.cupTopZ === undefined && opts.nestedCount === undefined) {
    throw new Error('pickOne: supply cupTopZ or nestedCount');
  }
  return post<PickSkillResponse>('/api/robot/skill/pick', {
    x, y,
    ...(opts.cupTopZ !== undefined ? { cup_top_z: opts.cupTopZ } : {}),
    ...(opts.nestedCount !== undefined ? { nested_count: opts.nestedCount } : {}),
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

export async function pyramidSkill(
  x: number, y: number, slot: PyramidSlot,
): Promise<PyramidSkillResponse> {
  return post<PyramidSkillResponse>('/api/robot/skill/pyramid', { x, y, slot });
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
