import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@stockiteasy/i18n';
import { Pressable, View } from 'react-native';
import { useColors, useI18n } from '../providers/app';
import { Text } from './ui';

export function LanguagePicker({ compact }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('common.language')} style={{ flexDirection: compact ? 'row' : 'column', gap: 8, alignSelf: compact ? 'center' : 'stretch' }}>
      {SUPPORTED_LOCALES.map((l) => {
        const active = l === locale;
        return (
          <Pressable
            key={l}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => setLocale(l)}
            style={{ paddingVertical: compact ? 6 : 16, paddingHorizontal: compact ? 12 : 16, borderRadius: 10, borderWidth: 1, borderColor: active ? c.secondary : c.border, backgroundColor: active ? c.infoSoft : c.surface }}
          >
            <Text weight={active ? '700' : '500'} size={compact ? 13 : 17}>{LOCALE_LABELS[l]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
