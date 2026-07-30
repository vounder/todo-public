import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Theme, useThemedStyles } from '../theme/ThemeContext';
import { Text, Card, Input, Button } from '../components';
import { ServerConfig } from '../services/ServerConfig';
import { ApiService } from '../services/ApiService';

export function ServerSetupScreen({ onComplete }: { onComplete: () => void }) {
  const styles = useThemedStyles(createStyles);
  const [url, setUrl] = useState(''); const [error, setError] = useState<string>(); const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); setError(undefined); try { await ServerConfig.setOverride(url); ApiService.reconnectForConfigurationChange(); onComplete(); } catch (e: any) { setError(e.message); } finally { setSaving(false); } };
  return <View style={styles.container}><Card><Text style={styles.title}>Server einrichten</Text><Text style={styles.copy}>Gib die Basis-URL deines Synchronisationsservers ein. Die App bleibt offline, bis eine gültige Adresse gespeichert ist.</Text><Input label="Server-URL" value={url} onChangeText={setUrl} placeholder="https://example.com" autoCapitalize="none" autoCorrect={false} keyboardType="url" error={error} /><Button standalone onPress={save} loading={saving} style={styles.button}>Speichern</Button></Card></View>;
}
const createStyles = (t: Theme) => StyleSheet.create({ container: { flex: 1, justifyContent: 'center', padding: t.spacing.lg, backgroundColor: t.colors.bg }, title: { ...t.type.title, color: t.colors.text, marginBottom: t.spacing.sm }, copy: { ...t.type.body, color: t.colors.textSub, marginBottom: t.spacing.lg }, button: { marginTop: t.spacing.lg } });
