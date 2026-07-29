import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useSettingsStore, type ColorSchemePreference } from '@/state/settings-store';
import { buildSyncEngine } from '@/composition/container';

const SCHEME_OPTIONS: { value: ColorSchemePreference; label: string }[] = [
  { value: 'system', label: '시스템 설정' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const {
    colorSchemePreference,
    setColorSchemePreference,
    syncServerUrl,
    setSyncServerUrl,
    deviceToken,
    setDeviceToken,
    lastSyncedAt,
    setLastSyncedAt,
  } = useSettingsStore();
  const [urlInput, setUrlInput] = useState(syncServerUrl ?? '');
  const [tokenInput, setTokenInput] = useState(deviceToken);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  function saveSyncSettings() {
    setSyncServerUrl(urlInput.trim().length > 0 ? urlInput.trim() : null);
    setDeviceToken(tokenInput.trim());
  }

  async function handleSyncNow() {
    saveSyncSettings();
    setSyncing(true);
    setLastResult(null);
    try {
      const engine = buildSyncEngine();
      const since = lastSyncedAt ?? new Date(0).toISOString();
      const result = await engine.syncNow(since);
      setLastSyncedAt(result.serverTime);
      const conflictNote = result.conflicts.length > 0 ? `, 충돌 ${result.conflicts.length}건` : '';
      setLastResult(`push ${result.pushedHabits + result.pushedCheckIns}건, pull ${result.pulledHabits + result.pulledCheckIns}건${conflictNote}`);
    } catch (err) {
      setLastResult(`동기화 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="title">설정</ThemedText>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          외관
        </ThemedText>
        <View style={styles.row}>
          {SCHEME_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setColorSchemePreference(option.value)}
              style={[
                styles.segment,
                { backgroundColor: colorSchemePreference === option.value ? theme.text : theme.backgroundElement },
              ]}>
              <ThemedText style={{ color: colorSchemePreference === option.value ? theme.background : theme.text }}>
                {option.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          관리
        </ThemedText>
        <Link href="/archive" asChild>
          <Pressable style={StyleSheet.flatten([styles.linkRow, { backgroundColor: theme.backgroundElement }])}>
            <ThemedText>보관된 습관 관리</ThemedText>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>
        </Link>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          Developer — 동기화 검증
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.hint}>
          로컬 백엔드(docker compose)를 가리키게 설정하면 push/pull을 확인할 수 있어요.
        </ThemedText>
        <TextInput
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="http://localhost:4000 (Android 에뮬레이터는 10.0.2.2)"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <TextInput
          value={tokenInput}
          onChangeText={setTokenInput}
          placeholder="Device Token"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        <Pressable onPress={handleSyncNow} disabled={syncing} style={[styles.syncButton, { backgroundColor: theme.text }]}>
          <ThemedText style={{ color: theme.background }}>{syncing ? '동기화 중...' : '지금 동기화'}</ThemedText>
        </Pressable>

        {lastSyncedAt ? (
          <ThemedText themeColor="textSecondary" style={styles.hint}>
            마지막 동기화: {new Date(lastSyncedAt).toLocaleString()}
          </ThemedText>
        ) : null}
        {lastResult ? <ThemedText style={styles.hint}>{lastResult}</ThemedText> : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20 },
  sectionLabel: { marginTop: 24, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  segment: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  hint: { marginTop: 8 },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 8 },
  syncButton: { marginTop: 16, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
});
