/**
 * Fetch wrapper with silent token refresh.
 *
 * - The access token (15 min) lives only in memory, never in localStorage,
 *   so an XSS bug can't steal a long-lived credential.
 * - The refresh token is an httpOnly cookie the JS can't read.
 * - On a 401, one shared refresh request runs (even if 10 calls fail at
 *   once), then the original requests are retried.
 */
const BASE = import.meta.env.VITE_API_URL || '';

let accessToken = null;
let refreshPromise = null;
let onSessionEnd = () => {};

export const setAccessToken = (t) => {
  accessToken = t;
};
export const onLoggedOut = (fn) => {
  onSessionEnd = fn;
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.code = body?.code;
    this.details = body?.details;
  }
  /** "amount: Enter a valid amount" -> { amount: "Enter a valid amount" } */
  get fieldErrors() {
    return Object.fromEntries((this.details || []).map((d) => [d.field, d.message]));
  }
}

export function refreshSession() {
  refreshPromise ||= fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, body);
      accessToken = body.accessToken;
      return body;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function api(path, { method = 'GET', body, headers = {}, retry = true, raw = false } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      onSessionEnd();
      throw new ApiError(401, { error: 'Your session ended. Please sign in again.', code: 'NO_SESSION' });
    }
    return api(path, { method, body, headers, retry: false, raw });
  }

  if (raw) {
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return res;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Download a file from an authenticated endpoint (e.g. CSV export). */
export async function download(path, fallbackName) {
  const res = await api(path, { raw: true });
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
