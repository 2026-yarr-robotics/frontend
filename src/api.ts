const BASE = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;

async function post<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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
  const res = await fetch(`${BASE}${path}`);
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
  return get('/api/robot/workspace/limits');
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
