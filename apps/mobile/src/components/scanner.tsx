import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useColors, useI18n } from '../providers/app';
import { Button, Input, Row, Text } from './ui';

/**
 * Camera barcode scanner with a manual entry fallback. Repeated reads of the
 * same code within 1.5 s are ignored so one product is not counted twice.
 */
export function Scanner({ onCode, height = 260 }: { onCode: (code: string) => void; height?: number }) {
  const { t } = useI18n();
  const c = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const handle = (code: string) => {
    const now = Date.now();
    if (code === last.current.code && now - last.current.at < 1500) return;
    last.current = { code, at: now };
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onCode(code);
  };

  return (
    <View style={{ gap: 10 }}>
      {permission?.granted ? (
        <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
            onBarcodeScanned={(r: BarcodeScanningResult) => handle(r.data)}
          />
          <View pointerEvents="none" style={{ position: 'absolute', left: '12%', right: '12%', top: '38%', height: '24%', borderWidth: 2, borderColor: c.accent, borderRadius: 12 }} />
        </View>
      ) : (
        <View style={{ height: 140, borderRadius: 16, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
          <Text muted style={{ textAlign: 'center' }}>{t('mobile.cameraPermission')}</Text>
          <Button title={t('mobile.grantPermission')} variant="outline" onPress={() => void requestPermission()} />
        </View>
      )}
      <Row>
        <View style={{ flex: 1 }}>
          <Input placeholder={t('mobile.manualEntry')} value={manual} onChangeText={setManual} autoCapitalize="characters" ltr onSubmitEditing={() => { if (manual.trim()) { handle(manual.trim()); setManual(''); } }} returnKeyType="done" />
        </View>
        <Button title={t('common.add')} variant="secondary" onPress={() => { if (manual.trim()) { handle(manual.trim()); setManual(''); } }} />
      </Row>
    </View>
  );
}
