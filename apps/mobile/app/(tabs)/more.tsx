import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { Badge, Button, Card, ListItem, Text } from '../../src/components/ui';
import { useAuth, useColors, useI18n, useSync } from '../../src/providers/app';

export default function More() {
  const { t, dir } = useI18n();
  const { me, org, can, signOut, selectOrg } = useAuth();
  const { pending, issues } = useSync();
  const c = useColors();
  const router = useRouter();
  const chevron = <Ionicons name={dir === 'rtl' ? 'chevron-back' : 'chevron-forward'} size={18} color={c.textMuted} />;
  const items = [
    { href: '/sync', label: t('sync.title'), right: pending.length + issues.length ? <Badge label={String(pending.length + issues.length)} tone={issues.length ? 'danger' : 'warning'} /> : chevron, show: true },
    { href: '/counts', label: t('counts.title'), show: can('stock_counts.read') },
    { href: '/transfer', label: t('transfers.new'), show: can('transfers.create') },
    { href: '/receiving', label: t('purchases.receiveTitle'), show: can('purchases.update') },
    { href: '/autopilot', label: t('autopilot.title'), show: can('autopilot.read') },
    { href: '/reports', label: t('reports.title'), show: can('reports.read') },
    { href: '/language', label: t('common.language'), show: true },
    { href: '/profile', label: t('common.profile'), show: true },
  ];
  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: 24 }}>
      <Card style={{ margin: 16 }}>
        <Text weight="700" size={17}>{me?.user.fullName}</Text>
        <Text muted>{me?.user.email}</Text>
        <Text muted>{org?.name} · {org?.role.key ? t(`roles.${org.role.key}`) : org?.role.name}</Text>
      </Card>
      {items.filter((i) => i.show).map((i) => <ListItem key={i.href} title={i.label} right={i.right ?? chevron} onPress={() => router.push(i.href as never)} />)}
      {me && me.organizations.length > 1 && (
        <Card style={{ margin: 16 }}>
          <Text weight="700">{t('onboarding.switchOrganization')}</Text>
          {me.organizations.map((o) => <Button key={o.id} title={o.name} variant={o.id === org?.id ? 'secondary' : 'outline'} onPress={() => void selectOrg(o.id)} />)}
        </Card>
      )}
      <Button title={t('common.logout')} variant="danger" style={{ margin: 16 }} onPress={() => void signOut()} />
    </ScrollView>
  );
}
