'use client';

import { ApiClient, ApiError } from '@stockiteasy/api-client';
import { session } from './session';

let localeGetter: () => string = () => 'fr-TN';
export function setApiLocaleGetter(fn: () => string) {
  localeGetter = fn;
}

let authFailureHandler: () => void = () => {};
export function setAuthFailureHandler(fn: () => void) {
  authFailureHandler = fn;
}

/** Refreshes with the httpOnly cookie (same-origin through the Next.js rewrite). */
async function refreshWithCookie(): Promise<string | null> {
  const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken: string };
  session.setToken(data.accessToken);
  return data.accessToken;
}

export const api = new ApiClient({
  baseUrl: '/api/v1',
  getAccessToken: session.getToken,
  setAccessToken: session.setToken,
  getOrganizationId: session.getOrg,
  refresh: refreshWithCookie,
  onAuthFailure: () => authFailureHandler(),
  getLocale: () => localeGetter(),
  credentials: 'include',
});

export { ApiError, refreshWithCookie };
