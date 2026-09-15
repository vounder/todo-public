import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Input, Notice, Text } from './index';
import { Theme, useThemedStyles } from '../theme/ThemeContext';
import { ServerConfig } from '../services/ServerConfig';
import { ApiService } from '../services/ApiService';
import { ConnectionCheck, probeConnection } from '../services/ConnectionProbe';
import { parseConnectionLink } from '../services/ConnectionLink';

export function ServerConnectionForm({ onComplete, onLocal, initialLink }: {
  onComplete?: () => void; onLocal?: () => void; initialLink?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const [url, setUrl] = useState(ServerConfig.getServerUrl() || '');
  const [key, setKey] = useState(ServerConfig.getAccessKey());
  const [error, setError] = useState('');
  const [checks, setChecks] = useState<ConnectionCheck[]>([]);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const controller = useRef<AbortController | null>(null);
  const scanned = useRef(false);
  useEffect(() => () => { controller.current?.abort(); }, []);
  const edit = () => { controller.current?.abort(); controller.current = null; setBusy(false); setChecks([]); setError(''); setConnected(false); };
  const importLink = (value: string) => {
    try { const connection = parseConnectionLink(value); edit(); setUrl(connection.url); setKey(connection.key); setScanning(false); }
    catch (e: any) { setError(e.message); setScanning(false); }
  };
  useEffect(() => { if (initialLink) importLink(initialLink); }, [initialLink]);
  const connect = async () => {
    const attempt = new AbortController();
    controller.current?.abort(); controller.current = attempt;
    setBusy(true); setError(''); setConnected(false);
    try {
      const result = await probeConnection(url.trim(), key.trim(), {
        signal: attempt.signal,
        onProgress: value => { if (!attempt.signal.aborted) setChecks(value); },
      });
      if (attempt.signal.aborted || !result.success) return;
      await ApiService.configure(url.trim(), key.trim());
      if (!attempt.signal.aborted) { setConnected(true); onComplete?.(); }
    } catch (e: any) { if (!attempt.signal.aborted) setError(e.message); }
    finally { if (!attempt.signal.aborted) setBusy(false); }
  };
  const confirmConnect = () => {
    const current = ServerConfig.getServerUrl();
    if (current && current !== url.trim().replace(/\/$/, '')) {
      if (Platform.OS === 'web') {
        if (globalThis.confirm('Server wechseln? Die lokalen Listen und ausstehenden Änderungen werden mit dem neuen Server zusammengeführt.')) void connect();
      } else Alert.alert('Server wechseln?', 'Die lokalen Listen und ausstehenden Änderungen werden mit dem neuen Server zusammengeführt.', [
        { text: 'Abbrechen', style: 'cancel' }, { text: 'Prüfen und wechseln', onPress: () => { void connect(); } },
      ]);
    } else void connect();
  };
  const useLocal = async () => {
    edit(); setBusy(true);
    try { await ApiService.configure(); setChecks([]); onLocal?.(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const scan = async () => {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (!granted) { setError('Kamera nicht freigegeben. Du kannst Adresse und Zugangsschlüssel auch unten eingeben.'); return; }
    scanned.current = false; setScanning(true);
  };
  return <View style={styles.container}>
    <Text style={styles.copy}>Scanne die Einrichtungskarte deines Servers oder gib die Verbindungsdaten ein. Handy und Server müssen im selben privaten Netzwerk oder VPN erreichbar sein.</Text>
    {Platform.OS !== 'web' && <Button standalone variant="secondary" icon="qr-code-outline" onPress={() => { void scan().catch(() => setError('Kamera konnte nicht geöffnet werden. Bitte manuell verbinden.')); }} disabled={busy}>QR-Code scannen</Button>}
    {permission?.status === 'denied' && !permission.canAskAgain && Platform.OS !== 'web' && <Button standalone variant="ghost" onPress={() => { void Linking.openSettings(); }}>Kamera in Einstellungen freigeben</Button>}
    <Input label="Server-Adresse" value={url} onChangeText={value => { edit(); setUrl(value); }} placeholder="https://sync.example.test" autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
    <Input label="Zugangsschlüssel" value={key} onChangeText={value => { edit(); setKey(value); }} placeholder="Von deiner Einrichtungskarte" autoCapitalize="none" autoCorrect={false} secureTextEntry editable={!busy} />
    <Text style={styles.hint}>Neue lokale Listen werden beim Verbinden mit diesem Server synchronisiert. Über das Internet HTTPS oder ein privates VPN verwenden.</Text>
    {!!error && <Notice tone="warning" message={error} />}
    {checks.length > 0 && <Card padding="sm">{checks.map(check => <View key={check.id} style={styles.check}>
      <Ionicons name={check.state === 'success' ? 'checkmark-circle' : check.state === 'error' ? 'alert-circle' : 'ellipse-outline'} size={21} color={check.state === 'success' ? '#17804B' : check.state === 'error' ? '#B24522' : '#667085'} accessible={false} />
      <View style={{ flex: 1 }}><Text accessibilityLiveRegion="polite">{check.label}{check.state === 'checking' ? ' …' : check.state === 'success' ? ' · OK' : ''}</Text>{check.message && <Text style={styles.hint}>{check.message}</Text>}</View>
    </View>)}</Card>}
    {connected && <Notice tone="info" message="Server verbunden. Deine Daten werden synchronisiert." />}
    <Button standalone loading={busy} disabled={!url.trim() || !key.trim()} onPress={confirmConnect}>Prüfen und verbinden</Button>
    {busy && <Button standalone variant="ghost" onPress={edit}>Prüfung abbrechen</Button>}
    {onLocal && <Button standalone variant="ghost" onPress={() => { void useLocal(); }} disabled={busy}>Ohne Server lokal verwenden</Button>}
    <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
      <View style={styles.scanner}>
        <Text style={styles.scanTitle}>Server-QR-Code scannen</Text>
        {scanning && <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => {
          if (scanned.current) return; scanned.current = true; importLink(data);
        }} />}
        <Button standalone onPress={() => setScanning(false)}>Abbrechen</Button>
      </View>
    </Modal>
  </View>;
}
const createStyles = (t: Theme) => StyleSheet.create({
  container: { gap: t.spacing.md },
  copy: { ...t.type.body, color: t.colors.textSub, lineHeight: 24 },
  hint: { ...t.type.caption, color: t.colors.textMuted, lineHeight: 20 },
  check: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
  scanner: { flex: 1, backgroundColor: t.colors.bg, paddingTop: 54, paddingBottom: 32, paddingHorizontal: 20, gap: 20 },
  scanTitle: { ...t.type.title, color: t.colors.text },
});
