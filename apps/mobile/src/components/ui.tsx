import { radii, spacing, touchTarget } from '@stockiteasy/design-tokens';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  Text as RNText,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, useI18n } from '../providers/app';

/** Text that aligns with the reading direction of the current language. */
export function Text({ style, muted, size = 15, weight, ...props }: TextProps & { muted?: boolean; size?: number; weight?: TextStyle['fontWeight'] }) {
  const c = useColors();
  const { dir } = useI18n();
  return (
    <RNText
      {...props}
      style={[{ color: muted ? c.textMuted : c.text, fontSize: size, fontWeight: weight, textAlign: dir === 'rtl' ? 'right' : 'left', writingDirection: dir }, style]}
    />
  );
}

/** Numbers, amounts, SKUs and phone numbers are always rendered left-to-right. */
export function Num({ children, style, size = 15, weight = '600' }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number; weight?: TextStyle['fontWeight'] }) {
  const c = useColors();
  return <RNText style={[{ color: c.text, fontSize: size, fontWeight: weight, writingDirection: 'ltr', fontVariant: ['tabular-nums'] }, style]}>{children}</RNText>;
}

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const c = useColors();
  const body = <View style={{ padding: padded ? spacing.lg : 0, gap: spacing.md }}>{children}</View>;
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.background }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : <View style={{ flex: 1 }}>{body}</View>}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.sm }, style]}>{children}</View>;
}

export function Row({ children, style, gap = spacing.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

type Variant = 'primary' | 'secondary' | 'accent' | 'outline' | 'danger' | 'ghost';

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style }: { title: string; onPress?: () => void; variant?: Variant; loading?: boolean; disabled?: boolean; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const bg = { primary: c.primary, secondary: c.secondary, accent: c.accent, outline: 'transparent', danger: c.danger, ghost: 'transparent' }[variant];
  const fg = { primary: c.primaryText, secondary: c.secondaryText, accent: c.accentText, outline: c.text, danger: '#fff', ghost: c.secondary }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          minHeight: touchTarget,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.md,
          backgroundColor: bg,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: c.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <RNText style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{title}</RNText>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string; ltr?: boolean }) {
  const c = useColors();
  const { dir } = useI18n();
  const { label, ltr, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label && <Text size={13} weight="600">{label}</Text>}
      <TextInput
        placeholderTextColor={c.textMuted}
        {...rest}
        style={[
          { minHeight: touchTarget, borderWidth: 1, borderColor: c.border, borderRadius: radii.md, paddingHorizontal: spacing.md, color: c.text, backgroundColor: c.surface, fontSize: 16, textAlign: ltr ? 'left' : dir === 'rtl' ? 'right' : 'left', writingDirection: ltr ? 'ltr' : dir },
          style,
        ]}
      />
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  const c = useColors();
  const map = { neutral: [c.surfaceMuted, c.textMuted], success: [c.successSoft, c.success], warning: [c.warningSoft, '#B45309'], danger: [c.dangerSoft, c.danger], info: [c.infoSoft, c.info] }[tone];
  return (
    <View style={{ backgroundColor: map[0], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <RNText style={{ color: map[1], fontSize: 12, fontWeight: '700' }}>{label}</RNText>
    </View>
  );
}

export function Kpi({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' | 'warning' | 'success' }) {
  const c = useColors();
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: c.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, gap: 4 }}>
      <Text muted size={12}>{label}</Text>
      <View>{typeof value === 'string' || typeof value === 'number' ? <Num size={20} weight="800" style={tone ? { color: tone === 'danger' ? c.danger : tone === 'warning' ? '#B45309' : c.success } : undefined}>{value}</Num> : value}</View>
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={c.secondary} /></View>;
}

export function Empty({ text }: { text?: string }) {
  const { t } = useI18n();
  return <View style={{ padding: 32, alignItems: 'center' }}><Text muted style={{ textAlign: 'center' }}>{text ?? t('common.emptyTitle')}</Text></View>;
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, te } = useI18n();
  const code = (error as { code?: string })?.code;
  return (
    <Card>
      <Text weight="700">{t('common.errorTitle')}</Text>
      <Text muted>{code ? te(code) : t('common.errorDescription')}</Text>
      {onRetry && <Button title={t('common.retry')} variant="outline" onPress={onRetry} />}
    </Card>
  );
}

export function OfflineBanner() {
  const c = useColors();
  const { t } = useI18n();
  return (
    <View style={{ backgroundColor: c.warningSoft, paddingVertical: 6, paddingHorizontal: 12 }}>
      <Text size={13} style={{ color: '#92400E', textAlign: 'center' }}>{t('mobile.offlineBanner')}</Text>
    </View>
  );
}

export function ListItem({ title, subtitle, right, onPress }: { title: string; subtitle?: ReactNode; right?: ReactNode; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => ({ backgroundColor: pressed ? c.surfaceMuted : c.surface, paddingVertical: 12, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchTarget })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="600">{title}</Text>
        {typeof subtitle === 'string' ? <Text muted size={13}>{subtitle}</Text> : subtitle}
      </View>
      {right}
    </Pressable>
  );
}
