import { LanguagePicker } from '../src/components/language-picker';
import { Screen, Text } from '../src/components/ui';
import { useI18n } from '../src/providers/app';

export default function Language() {
  const { t } = useI18n();
  return (
    <Screen>
      <Text muted>{t('settings.languageHint')}</Text>
      <LanguagePicker />
    </Screen>
  );
}
