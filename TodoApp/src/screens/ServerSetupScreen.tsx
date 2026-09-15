import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Card, Button, Notice } from '../components';
import { ServerConnectionForm } from '../components/ServerConnectionForm';
import { Theme, useThemedStyles } from '../theme/ThemeContext';
import { ApiService } from '../services/ApiService';

export function ServerSetupScreen({ onComplete, initialLink, onCancel }: { onComplete: () => void; initialLink?: string; onCancel?: () => void }) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [showConnection, setShowConnection] = useState(!!initialLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (initialLink) setShowConnection(true); }, [initialLink]);
  const startLocal = async () => {
    setBusy(true); setError('');
    try { await ApiService.configure(); onComplete(); }
    catch { setError('Der lokale Speicher ist nicht verfügbar. Bitte die App neu öffnen.'); }
    finally { setBusy(false); }
  };
  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: Math.max(32, insets.top + 20), paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.inner}><Text style={styles.eyebrow}>TODO · DEIN ALLTAG, DEINE LISTEN</Text>
        <Text style={styles.title}>Einfach anfangen.</Text>
        <Text style={styles.copy}>Aufgaben, Einkäufe und Gerichte bleiben auf deinem Gerät gespeichert. Mit einem eigenen Server teilst du sie mit deinen anderen Geräten. Der Planer benötigt eine Serververbindung.</Text>
        {!showConnection ? <Card>
          <View style={{ gap: 16 }}><Text style={styles.heading}>Wie möchtest du starten?</Text>
            <Button standalone loading={busy} icon="phone-portrait-outline" onPress={() => { void startLocal(); }}>Lokal auf diesem Gerät starten</Button>
            <Text style={styles.copy}>Ohne Konto oder Server. Du kannst später jederzeit synchronisieren.</Text>
            <Button standalone variant="secondary" icon="qr-code-outline" disabled={busy} onPress={() => setShowConnection(true)}>Mit eigenem Server verbinden</Button>
            {!!error && <Notice tone="warning" message={error} />}
          </View>
        </Card> : <Card><Text style={styles.heading}>Server verbinden</Text><ServerConnectionForm onComplete={onComplete} onLocal={onComplete} initialLink={initialLink} /></Card>}
        {onCancel && <Button standalone variant="ghost" onPress={onCancel}>Zurück zur App</Button>}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const createStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg }, content: { flexGrow: 1, padding: 20, justifyContent: 'center' },
  inner: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: 20 },
  eyebrow: { ...t.type.caption, color: t.colors.accent }, title: { ...t.type.title, fontSize: 32, lineHeight: 40, color: t.colors.text },
  copy: { ...t.type.body, color: t.colors.textSub, lineHeight: 24 }, heading: { ...t.type.heading, color: t.colors.text, marginBottom: 16 },
});
