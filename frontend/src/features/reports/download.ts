import { store } from '@/app/store';
import { logout, setCredentials } from '@/features/auth/authSlice';
import { refreshSession } from '@/features/auth/session';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

type Params = Record<string, string | number | null | undefined>;

function buildUrl(path: string, params: Params): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const s = qs.toString();
  return `${API}${path}${s ? `?${s}` : ''}`;
}

const send = (url: string) => {
  const token = store.getState().auth.token;
  return fetch(url, {
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};

export async function downloadReport(path: string, params: Params, filename: string): Promise<void> {
  const url = buildUrl(path, params);
  let res = await send(url);

  if (res.status === 401) {
    // the access token expired: refresh once, like baseApi does, then retry
    const session = await refreshSession();
    if (!session) {
      store.dispatch(logout());
      throw new Error('Your session has expired. Please log in again.');
    }
    store.dispatch(setCredentials({ user: session.user, token: session.access_token }));
    res = await send(url);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.detail === 'string' ? body.detail : 'Could not create the file.');
  }

  const blob = await res.blob();
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}