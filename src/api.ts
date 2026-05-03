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
