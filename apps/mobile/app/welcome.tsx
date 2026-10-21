import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Row, Text } from '../src/components/ui';
import { LanguagePicker } from '../src/components/language-picker';
import { kv } from '../src/lib/db';
import { useColors, useI18n } from '../src/providers/app';

const SLIDES = [
  { title: 'landing.f1Title', text: 'landing.f1Text' },
  { title: 'landing.f3Title', text: 'landing.f3Text' },
  { title: 'landing.f4Title', text: 'landing.f4Text' },
];

/** First-launch onboarding: language choice and the three key promises. */
export default function Welcome() {
  const { t } = useI18n();
  const c = useColors();
  const router = useRouter();
  const [i, setI] = useState(0);
  const finish = async () => {
    await kv.set('onboarded', true);
    router.replace('/login');
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background, padding: 24, gap: 24 }}>
      <LanguagePicker compact />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
        <Image source={require('../assets/icon.png')} style={{ width: 140, height: 140 }} accessibilityIgnoresInvertColors />
        <Text size={24} weight="800" style={{ textAlign: 'center' }}>{t(SLIDES[i].title)}</Text>
        <Text muted size={16} style={{ textAlign: 'center' }}>{t(SLIDES[i].text)}</Text>
        <Row style={{ justifyContent: 'center' }}>
          {SLIDES.map((_, k) => <View key={k} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? c.secondary : c.border }} />)}
        </Row>
      </View>
      <Button title={i < SLIDES.length - 1 ? t('common.next') : t('landing.ctaStart')} onPress={() => (i < SLIDES.length - 1 ? setI(i + 1) : void finish())} />
      <Button title={t('landing.ctaLogin')} variant="ghost" onPress={() => void finish()} />
    </SafeAreaView>
  );
}
