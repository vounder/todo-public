/**
 * Debug Screen für Server-Verbindungs-Tests
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiService } from '../services/ApiService';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text, ScreenHeader, Card, Button } from '../components';

export function DebugScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const serverInfo = ApiService.getServerInfo();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    httpAvailable: boolean;
    wsAvailable: boolean;
    error?: string;
    details: string[];
  } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setResult(null);

    try {
      const testResult = await ApiService.testConnection();
      setResult(testResult);
    } catch (error: any) {
      setResult({
        success: false,
        httpAvailable: false,
        wsAvailable: false,
        error: error.message,
        details: ['Test failed with exception:', error.message],
      });
    } finally {
      setTesting(false);
    }
  };

  const renderStatus = (label: string, ok: boolean) => (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={styles.statusValue}>
        <Ionicons
          name={ok ? 'checkmark-circle' : 'close-circle'}
          size={16}
          color={ok ? colors.success : colors.danger}
        />
        <Text style={[styles.statusText, { color: ok ? colors.success : colors.danger }]}>
          {ok ? 'OK' : 'Fehlgeschlagen'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Server-Debug" variant="compact" onBack={() => navigation?.goBack()} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Server</Text>
        <Card style={styles.block}>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Server</Text>
            <Text style={styles.infoValue}>{serverInfo.baseUrl}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>WebSocket</Text>
            <Text style={styles.infoValue}>{serverInfo.wsUrl}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Plattform</Text>
            <Text style={styles.infoValue}>
              {Platform.OS} {Platform.Version}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Modus</Text>
            <Text style={styles.infoValue}>{__DEV__ ? 'Development' : 'Production'}</Text>
          </View>
        </Card>

        <Button
          onPress={runTest}
          loading={testing}
          icon="pulse-outline"
          standalone
          style={styles.block}
        >
          Verbindung testen
        </Button>

        {result && (
          <>
            <Text style={styles.sectionTitle}>Ergebnis</Text>
            <Card style={styles.block}>
              <View style={styles.resultHead}>
                <Ionicons
                  name={result.success ? 'checkmark-circle' : 'alert-circle'}
                  size={20}
                  color={result.success ? colors.success : colors.danger}
                />
                <Text style={styles.resultTitle}>
                  {result.success ? 'Tests bestanden' : 'Tests fehlgeschlagen'}
                </Text>
              </View>

              {renderStatus('HTTP', result.httpAvailable)}
              {renderStatus('WebSocket', result.wsAvailable)}

              <View style={styles.log}>
                {result.details.map((detail, index) => (
                  <Text key={index} style={styles.logLine}>
                    {detail}
                  </Text>
                ))}
              </View>
            </Card>
          </>
        )}

        <Card style={[styles.block, styles.help]}>
          <View style={styles.helpHead}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Text style={styles.helpTitle}>Wenn Tests fehlschlagen</Text>
          </View>
          <Text style={styles.helpText}>
            • Internetverbindung prüfen{'\n'}• Server muss erreichbar sein{'\n'}• Konfigurierten Port prüfen
            blockiert sein{'\n'}• In Produktion: Cleartext-Traffic muss erlaubt sein{'\n'}
            {'\n'}
            Logs finden sich in der Konsole (adb logcat).
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.spacing.lg, paddingBottom: t.spacing.xxl },
    block: { marginBottom: t.spacing.lg },
    sectionTitle: {
      ...t.type.label,
      color: t.colors.textMuted,
      marginBottom: t.spacing.sm,
      paddingHorizontal: t.spacing.xs,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: t.spacing.lg,
      paddingVertical: t.spacing.xs + 2,
    },
    infoKey: { ...t.type.body, color: t.colors.textSub },
    infoValue: { ...t.type.mono, color: t.colors.text, flexShrink: 1, textAlign: 'right' },
    resultHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      paddingBottom: t.spacing.md,
      marginBottom: t.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    resultTitle: { ...t.type.heading, color: t.colors.text },
    statusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: t.spacing.sm,
    },
    statusLabel: { ...t.type.bodyStrong, color: t.colors.text },
    statusValue: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs + 2 },
    statusText: { ...t.type.label },
    log: {
      marginTop: t.spacing.md,
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: t.radius.sm,
      padding: t.spacing.md,
    },
    logLine: { ...t.type.mono, color: t.colors.textSub, marginBottom: 2 },
    help: { backgroundColor: t.colors.warningSurface },
    helpHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      marginBottom: t.spacing.sm,
    },
    helpTitle: { ...t.type.heading, color: t.colors.warning },
    helpText: { ...t.type.body, color: t.colors.textSub },
  });
