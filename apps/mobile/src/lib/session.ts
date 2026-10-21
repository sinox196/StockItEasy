import * as SecureStore from 'expo-secure-store';

/** Refresh token lives in the OS keychain/keystore; the access token only in memory. */
const RT_KEY = 'sie.refreshToken';
let accessToken: string | null = null;
let organizationId: string | null = null;

export const session = {
  getToken: () => accessToken,
  setToken: (t: string | null) => {
    accessToken = t;
  },
  getOrg: () => organizationId,
  setOrg: (id: string | null) => {
    organizationId = id;
  },
  getRefreshToken: () => SecureStore.getItemAsync(RT_KEY),
  setRefreshToken: async (t: string | null) => {
    if (t) await SecureStore.setItemAsync(RT_KEY, t);
    else await SecureStore.deleteItemAsync(RT_KEY);
  },
};
