import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Theme, ThemeMode, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text, ScreenHeader, Card, ListRow } from '../components';
import { ServerConnectionForm } from '../components/ServerConnectionForm';
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
  const [localOnly, setLocalOnly] = useState(ServerConfig.isLocalOnly());

  return (
    <View style={styles.container}>
      <ScreenHeader title="Einstellungen" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
              selected={mode === o.mode}
              trailing={
                mode === o.mode ? (
                  <Ionicons name="checkmark" size={20} color={colors.accent} />
                ) : undefined
              }
            />
          ))}
        </Card>

        <View style={[styles.sectionHead, { marginTop: 24 }]}>
          <Ionicons name="server-outline" size={16} color={colors.textMuted} />
          <Text style={styles.sectionTitle}>{localOnly ? 'Lokal auf diesem Gerät' : 'Server verbinden'}</Text>
        </View>
        <Card padding="sm">
          <ServerConnectionForm onComplete={() => setLocalOnly(false)} onLocal={() => setLocalOnly(true)} />
        </Card>
        <View style={[styles.sectionHead, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>Hilfe und Verbindung</Text>
        </View>
        <Card padding="sm">
          <ListRow title="Verbindung prüfen" subtitle="Serverstatus und technische Diagnose" icon="pulse-outline"
            onPress={() => navigation.navigate('Debug')} />
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
