import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useSettingsStore, type ColorSchemePreference, type SyncMode } from '@/state/settings-store';
import { buildSyncEngine, getConfiguredSupabaseClient } from '@/composition/container';
import { signInWithGoogle, signOutSupabase } from '@/data/supabase/auth';

const SCHEME_OPTIONS: { value: ColorSchemePreference; label: string }[] = [
  { value: 'system', label: '시스템 설정' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

const SYNC_MODE_OPTIONS: { value: SyncMode; label: string }[] = [
  { value: 'off', label: '사용 안 함' },
  { value: 'rest', label: 'REST 백엔드' },
  { value: 'supabase', label: 'Supabase' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const {
    colorSchemePreference,
    setColorSchemePreference,
    syncMode,
    setSyncMode,
    syncServerUrl,
    setSyncServerUrl,
    deviceToken,
    setDeviceToken,
    supabaseUrl,
    setSupabaseUrl,
    supabaseAnonKey,
    setSupabaseAnonKey,
    lastSyncedAt,
    setLastSyncedAt,
  } = useSettingsStore();
  const [urlInput, setUrlInput] = useState(syncServerUrl ?? '');
  const [tokenInput, setTokenInput] = useState(deviceToken);
  const [supabaseUrlInput, setSupabaseUrlInput] = useState(supabaseUrl ?? '');
  const [supabaseAnonKeyInput, setSupabaseAnonKeyInput] = useState(supabaseAnonKey ?? '');
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const client = getConfiguredSupabaseClient();
    if (!client) {
      setSession(null);
      return;
    }
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.subscription.unsubscribe();
  }, [supabaseUrl, supabaseAnonKey]);

  function saveSyncSettings() {
    setSyncServerUrl(urlInput.trim().length > 0 ? urlInput.trim() : null);
    setDeviceToken(tokenInput.trim());
  }

  function saveSupabaseSettings() {
    setSupabaseUrl(supabaseUrlInput.trim().length > 0 ? supabaseUrlInput.trim() : null);
    setSupabaseAnonKey(supabaseAnonKeyInput.trim().length > 0 ? supabaseAnonKeyInput.trim() : null);
  }

  async function handleGoogleSignIn() {
    saveSupabaseSettings();
    const client = getConfiguredSupabaseClient();
    if (!client) {
      setAuthError('먼저 Supabase URL과 anon key를 입력하세요.');
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle(client);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    const client = getConfiguredSupabaseClient();
    if (client) await signOutSupabase(client);
  }

  async function handleSyncNow() {
    saveSyncSettings();
    saveSupabaseSettings();
    setSyncing(true);
    setLastResult(null);
    try {
      const engine = await buildSyncEngine();
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
          동기화
        </ThemedText>
        <View style={styles.row}>
          {SYNC_MODE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setSyncMode(option.value)}
              style={[styles.segment, { backgroundColor: syncMode === option.value ? theme.text : theme.backgroundElement }]}>
              <ThemedText style={{ color: syncMode === option.value ? theme.background : theme.text }}>
                {option.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {syncMode === 'rest' ? (
          <>
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
          </>
        ) : syncMode === 'supabase' ? (
          <>
            <ThemedText themeColor="textSecondary" style={styles.hint}>
              내 Supabase 프로젝트로 동기화해요. Google로 로그인하면 같은 계정을 쓰는 다른 기기와 데이터가 오갑니다.
            </ThemedText>
            <TextInput
              value={supabaseUrlInput}
              onChangeText={setSupabaseUrlInput}
              onBlur={saveSupabaseSettings}
              placeholder="https://xxxx.supabase.co"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <TextInput
              value={supabaseAnonKeyInput}
              onChangeText={setSupabaseAnonKeyInput}
              onBlur={saveSupabaseSettings}
              placeholder="anon public key"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />

            {session ? (
              <>
                <ThemedText style={styles.hint}>{session.user.email ?? session.user.id} 로 로그인됨</ThemedText>
                <Pressable onPress={handleSignOut} style={[styles.syncButton, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText>로그아웃</ThemedText>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={handleGoogleSignIn}
                disabled={signingIn}
                style={[styles.syncButton, { backgroundColor: theme.text }]}>
                <ThemedText style={{ color: theme.background }}>{signingIn ? '로그인 중...' : 'Google로 로그인'}</ThemedText>
              </Pressable>
            )}
            {authError ? <ThemedText style={[styles.hint, { color: '#E85D75' }]}>{authError}</ThemedText> : null}
          </>
        ) : (
          <ThemedText themeColor="textSecondary" style={styles.hint}>
            동기화가 꺼져 있어요. 데이터는 이 기기에만 저장됩니다.
          </ThemedText>
        )}

        {syncMode !== 'off' && (syncMode !== 'supabase' || session) ? (
          <Pressable onPress={handleSyncNow} disabled={syncing} style={[styles.syncButton, { backgroundColor: theme.text }]}>
            <ThemedText style={{ color: theme.background }}>{syncing ? '동기화 중...' : '지금 동기화'}</ThemedText>
          </Pressable>
        ) : null}

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
