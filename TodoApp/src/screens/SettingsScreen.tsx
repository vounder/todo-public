import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, ThemeMode, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text, ScreenHeader, Card, ListRow, Input, Button } from '../components';
import { ServerConfig } from '../services/ServerConfig';
import { ApiService } from '../services/ApiService';

const APPEARANCE_OPTIONS: { mode: ThemeMode; label: string; description: string }[] = [
  { mode: 'system', label: 'System', description: 'Folgt der Einstellung des Geräts' },
  { mode: 'light', label: 'Hell', description: 'Immer helle Oberfläche' },
  { mode: 'dark', label: 'Dunkel', description: 'Immer dunkle Oberfläche' },
];

export default function SettingsScreen({ navigation }: any) {
  const { colors, mode, setMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [serverUrl, setServerUrl] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  useEffect(() => { setServerUrl(ServerConfig.getServerUrl() ?? ''); }, []);
  const saveServer = async () => {
    setSaving(true); setError(undefined);
    try { setServerUrl(await ServerConfig.setOverride(serverUrl)); ApiService.reconnectForConfigurationChange(); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };
  const resetServer = async () => {
    const buildDefault = ServerConfig.getBuildDefault();
    if (!buildDefault) {
      setError('Für diesen Build ist kein Server-Standard hinterlegt.');
      return;
    }
    setServerUrl((await ServerConfig.resetOverride()) ?? '');
    setError(undefined);
    ApiService.reconnectForConfigurationChange();
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Einstellungen" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sectionHead}>
          <Ionicons name="contrast-outline" size={16} color={colors.textMuted} />
          <Text style={styles.sectionTitle}>Erscheinungsbild</Text>
        </View>

        <Card padding="sm">
          {APPEARANCE_OPTIONS.map(o => (
            <ListRow
              key={o.mode}
              title={o.label}
              subtitle={o.description}
              onPress={() => setMode(o.mode)}
              trailing={
                mode === o.mode ? (
                  <Ionicons name="checkmark" size={20} color={colors.accent} />
                ) : undefined
              }
            />
          ))}
        </Card>

        <View style={styles.sectionHead}>
          <Ionicons name="server-outline" size={16} color={colors.textMuted} />
          <Text style={styles.sectionTitle}>Synchronisationsserver</Text>
        </View>
        <Card padding="sm">
          <Input label="Server-URL" value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://example.com" error={error} />
          <View style={styles.buttonRow}>
            <Button standalone size="sm" onPress={saveServer} loading={saving}>Speichern</Button>
            <Button standalone size="sm" variant="secondary" onPress={resetServer}>Build-Standard</Button>
          </View>
          <Text style={styles.hint}>REST und WebSocket werden automatisch aus dieser Adresse abgeleitet.</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.spacing.lg, paddingBottom: t.spacing.xxl },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      marginBottom: t.spacing.sm,
      paddingHorizontal: t.spacing.xs,
    },
    sectionTitle: { ...t.type.label, color: t.colors.textMuted },
    buttonRow: { flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.md },
    hint: { ...t.type.caption, color: t.colors.textMuted, marginTop: t.spacing.sm },
  });
