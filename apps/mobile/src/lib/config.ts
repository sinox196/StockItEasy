import Constants from 'expo-constants';

/** API base URL (with /api/v1). Set EXPO_PUBLIC_API_URL; app.json "extra.apiUrl" is the emulator default. */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://10.0.2.2:4000/api/v1';
