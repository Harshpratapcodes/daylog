const BASE = '/api/v1';

export function getToken() { return localStorage.getItem('daylog_token'); }

/** User id from the JWT payload — used to namespace localStorage per account. */
export function getUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).id ?? null;
  } catch { return null; }
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem('daylog_token', t);
  else localStorage.removeItem('daylog_token');
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: unknown = null) {
    super(message);
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  // Only claim a JSON body when one is actually sent — Fastify 400s on an
  // empty body with content-type set (bodyless DELETEs broke on this).
  const headers: Record<string, string> = {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(options.headers as any),
  };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error ?? {};
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? `Request failed (${res.status})`, err.details);
  }
  return body as T;
}

/** `archived: true` = deleted but still referenced by past days; shown in reviews, hidden from logging. */
export interface Category { id: number; name: string; color: string; is_system: boolean; archived: boolean }

export const fetchCategories = () => api<{ categories: Category[] }>('/categories');
export const suggest = (q: string) =>
  api<{ suggestions: Array<{ name: string; category_id: number; category_name: string; category_color: string; typical_duration_min: number }> }>(
    `/activities/suggest?q=${encodeURIComponent(q)}`
  );
