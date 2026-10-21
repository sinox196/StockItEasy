import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Text } from '../src/components/ui';
import { LanguagePicker } from '../src/components/language-picker';
import { API_URL } from '../src/lib/config';
import { useAuth, useColors, useI18n } from '../src/providers/app';

export default function Login() {
  const { t, te } = useI18n();
  const c = useColors();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const me = await signIn(email.trim().toLowerCase(), password);
      if (me && me.organizations.length === 0) setError(t('errors.NO_ORGANIZATION'));
    } catch (e) {
      setError(te((e as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
        <LanguagePicker compact />
        <View style={{ alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Image source={require('../assets/icon.png')} style={{ width: 96, height: 96 }} />
          <Text size={26} weight="800">{t('auth.loginTitle')}</Text>
          <Text muted style={{ textAlign: 'center' }}>{t('auth.loginSubtitle')}</Text>
        </View>
        <Input label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" ltr />
        <Input label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        {error && <Text style={{ color: c.danger }}>{error}</Text>}
        <Button title={t('auth.login')} onPress={submit} loading={busy} disabled={!email || !password} />
        <Text muted size={11} style={{ textAlign: 'center' }}>{API_URL}</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
