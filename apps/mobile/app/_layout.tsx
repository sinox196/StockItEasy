import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { kv } from '../src/lib/db';
import { AppProviders, useAuth, useColors, useI18n } from '../src/providers/app';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Routes signed-out users to onboarding/login and signed-in users into the app. */
function Gate() {
  const { status } = useAuth();
  const { t } = useI18n();
  const c = useColors();
  const segments = useSegments();
  const router = useRouter();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void kv.get<boolean>('onboarded').then((v) => setOnboarded(!!v));
  }, [segments]);

  useEffect(() => {
    if (status === 'loading' || onboarded === null) return;
    void SplashScreen.hideAsync().catch(() => undefined);
    const top = segments[0];
    const publicRoute = top === 'login' || top === 'welcome';
    if (status === 'anonymous' && !publicRoute) router.replace(onboarded ? '/login' : '/welcome');
    if (status === 'authenticated' && publicRoute) router.replace('/(tabs)');
  }, [status, onboarded, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: t('common.product') }} />
      <Stack.Screen name="adjust" options={{ title: t('mobile.quickAdjust'), presentation: 'modal' }} />
      <Stack.Screen name="counts/index" options={{ title: t('counts.title') }} />
      <Stack.Screen name="counts/[id]" options={{ title: t('mobile.physicalCount') }} />
      <Stack.Screen name="transfer" options={{ title: t('transfers.new') }} />
      <Stack.Screen name="receiving" options={{ title: t('purchases.receiveTitle') }} />
      <Stack.Screen name="autopilot" options={{ title: t('autopilot.title') }} />
      <Stack.Screen name="reports" options={{ title: t('reports.title') }} />
      <Stack.Screen name="sync" options={{ title: t('sync.title') }} />
      <Stack.Screen name="language" options={{ title: t('common.language') }} />
      <Stack.Screen name="profile" options={{ title: t('common.profile') }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <StatusBar style="auto" />
        <Gate />
      </AppProviders>
    </SafeAreaProvider>
  );
}
