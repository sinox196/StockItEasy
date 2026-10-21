import { ApiClient, ApiError } from '@stockiteasy/api-client';
import { API_URL } from './config';
import { session } from './session';

let localeGetter = () => 'fr-TN';
export const setLocaleGetter = (fn: () => string) => (localeGetter = fn);
let onAuthFailure = () => {};
export const setAuthFailureHandler = (fn: () => void) => (onAuthFailure = fn);

/** Rotating refresh: the new refresh token replaces the old one in SecureStore. */
export async function refreshSession(): Promise<string | null> {
  const rt = await session.getRefreshToken();
  if (!rt) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
    if (!res.ok) {
      if (res.status === 401) await session.setRefreshToken(null);
      return null;
    }
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    await session.setRefreshToken(data.refreshToken);
    session.setToken(data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

export const api = new ApiClient({
  baseUrl: API_URL,
  getAccessToken: session.getToken,
  setAccessToken: session.setToken,
  getOrganizationId: session.getOrg,
  refresh: refreshSession,
  onAuthFailure: () => onAuthFailure(),
  getLocale: () => localeGetter(),
  credentials: 'omit',
});

export { ApiError };
