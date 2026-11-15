import type { LoginResponse } from '@/types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

// Returns the new session, null when the user is really signed out (401/403),
// and throws on network or server errors so a bad connection never logs anyone out.
async function callRefresh(): Promise<LoginResponse | null> {
  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    credentials: 'include', // sends the httpOnly cookie
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
  return (await res.json()) as LoginResponse;
}

let inflight: Promise<LoginResponse | null> | null = null;

// One refresh at a time. Concurrent callers share the same promise, and the Web Lock
// serializes tabs. Refresh tokens rotate, so two refreshes at once could look like theft.
export function refreshSession(): Promise<LoginResponse | null> {
  if (!inflight) {
    const run = 'locks' in navigator ? navigator.locks.request('auth-refresh', callRefresh) : callRefresh();
    inflight = run.finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

// Sign out every open tab
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lay-auth') : null;

export const broadcastLogout = () => channel?.postMessage('logout');

export const onRemoteLogout = (callback: () => void) => {
  if (!channel) return () => {};
  const handler = (e: MessageEvent) => {
    if (e.data === 'logout') callback();
  };
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
};