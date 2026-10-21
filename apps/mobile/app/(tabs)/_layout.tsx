import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { OfflineBanner } from '../../src/components/ui';
import { useColors, useI18n, useSync } from '../../src/providers/app';

/** Bottom navigation for the daily essentials; the scanner sits in the middle, one tap away. */
export default function TabsLayout() {
  const c = useColors();
  const { t } = useI18n();
  const { online, pending } = useSync();
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;
  return (
    <View style={{ flex: 1 }}>
      {!online && <OfflineBanner />}
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: c.secondary,
          tabBarInactiveTintColor: c.textMuted,
          tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 64, paddingBottom: 8 },
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.text,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t('mobile.home'), tabBarIcon: icon('home-outline') }} />
        <Tabs.Screen name="products" options={{ title: t('nav.products'), tabBarIcon: icon('cube-outline') }} />
        <Tabs.Screen
          name="scan"
          options={{
            title: t('mobile.scan'),
            tabBarIcon: ({ size }) => (
              <View style={{ backgroundColor: c.secondary, borderRadius: 18, padding: 8, marginTop: -6 }}>
                <Ionicons name="barcode-outline" color="#fff" size={size} />
              </View>
            ),
          }}
        />
        <Tabs.Screen name="alerts" options={{ title: t('mobile.alerts'), tabBarIcon: icon('notifications-outline') }} />
        <Tabs.Screen name="more" options={{ title: t('mobile.more'), tabBarIcon: icon('menu-outline'), tabBarBadge: pending.length || undefined }} />
      </Tabs>
    </View>
  );
}
