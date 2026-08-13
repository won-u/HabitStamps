import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useSettingsStore, type ColorSchemePreference } from '@/state/settings-store';
import { getConfiguredSupabaseClient, runSync } from '@/composition/container';
import { signInWithGoogle, signOutSupabase } from '@/data/supabase/auth';

const SCHEME_OPTIONS: { value: ColorSchemePreference; label: string }[] = [
  { value: 'system', label: '시스템 설정' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { colorSchemePreference, setColorSchemePreference, lastSyncedAt, setLastSyncedAt } = useSettingsStore();
  const [session, setSession] = useState<Session | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const client = getConfiguredSupabaseClient();
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleGoogleSignIn() {
    const client = getConfiguredSupabaseClient();
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle(client);
      // lastSyncedAt을 리셋하고 나서 동기화한다 — 그렇지 않으면 이전에 로그인했던
      // 기록이 남아있는 계정으로 다시 로그인할 때, 그 사이 서버에서 직접 실행한
      // SQL 정리처럼 "이 기기의 워터마크보다 과거 시각으로 갱신된" 변경 사항을
      // 증분 pull(`updated_at > since`)이 영원히 놓치게 된다. 로그인은 항상
      // 전체 재동기화를 해도 괜찮을 만큼 드문 이벤트이므로 안전하게 리셋한다.
      setLastSyncedAt(null);
      void runSync(); // 로그인 직후 1회 — 그때까지의 로컬 데이터를 서버로 마이그레이션
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await signOutSupabase(getConfiguredSupabaseClient());
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20 }]}>
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
        {session ? (
          <>
            <ThemedText themeColor="textSecondary" style={styles.hint}>
              {session.user.email ?? session.user.id} 로 로그인됨 — 다른 기기와 자동으로 동기화됩니다.
            </ThemedText>
            <Pressable onPress={handleSignOut} style={[styles.syncButton, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText>로그아웃</ThemedText>
            </Pressable>
            {lastSyncedAt ? (
              <ThemedText themeColor="textSecondary" style={styles.hint}>
                마지막 동기화: {new Date(lastSyncedAt).toLocaleString()}
              </ThemedText>
            ) : null}
          </>
        ) : (
          <>
            <ThemedText themeColor="textSecondary" style={styles.hint}>
              Google로 로그인하면 다른 기기와 자동으로 동기화됩니다. 로그인하지 않으면 데이터는 이 기기에만 저장돼요.
            </ThemedText>
            <Pressable
              onPress={handleGoogleSignIn}
              disabled={signingIn}
              style={[styles.syncButton, { backgroundColor: theme.text }]}>
              <ThemedText style={{ color: theme.background }}>{signingIn ? '로그인 중...' : 'Google로 로그인'}</ThemedText>
            </Pressable>
            {authError ? <ThemedText style={[styles.hint, { color: '#E85D75' }]}>{authError}</ThemedText> : null}
          </>
        )}
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
  syncButton: { marginTop: 16, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
});
