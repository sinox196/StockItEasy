/**
 * In-memory access token (never persisted: XSS cannot read it from storage) and
 * the selected organization (persisted per browser for convenience).
 */
let accessToken: string | null = null;
const ORG_KEY = 'sie_org';

export const session = {
  getToken: () => accessToken,
  setToken: (t: string | null) => {
    accessToken = t;
  },
  getOrg: (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(ORG_KEY);
    } catch {
      return null;
    }
  },
  setOrg: (id: string | null) => {
    try {
      if (id) window.localStorage.setItem(ORG_KEY, id);
      else window.localStorage.removeItem(ORG_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};
