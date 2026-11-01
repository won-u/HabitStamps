import { useEffect, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useSettingsStore, type ColorSchemePreference } from '@/state/settings-store';
import { getConfiguredSupabaseClient, runSync } from '@/composition/container';
import { signInWithGoogle, signOutSupabase } from '@/data/supabase/auth';
import { ExportTokenSection } from '@/components/export-token-section';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useTabBarSpace } from '@/hooks/use-bottom-inset';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const SCHEME_OPTIONS: { value: ColorSchemePreference; label: string }[] = [
  { value: 'system', label: '시스템' },
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
  const tabBarSpace = useTabBarSpace();

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
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: tabBarSpace }]}
        showsVerticalScrollIndicator={false}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          앱 환경
        </ThemedText>
        <ThemedText type="title" style={styles.title}>
          설정
        </ThemedText>

        <Section title="외관">
          <View style={styles.sectionPad}>
            <SegmentedControl options={SCHEME_OPTIONS} value={colorSchemePreference} onChange={setColorSchemePreference} />
          </View>
        </Section>

        <Section title="관리">
          <Row icon="archive-outline" iconColor="#F5A623" label="보관된 습관 관리" onPress={() => router.push('/archive')} />
        </Section>

        <Section title="동기화">
          {session ? (
            <>
              <Row
                icon="person-circle-outline"
                iconColor="#2FBFA0"
                label={session.user.email ?? session.user.id}
                detail={lastSyncedAt ? `마지막 동기화 · ${new Date(lastSyncedAt).toLocaleString()}` : '다른 기기와 자동으로 동기화돼요'}
              />
              <Row icon="log-out-outline" iconColor="#7C8A9E" label="로그아웃" onPress={handleSignOut} divider />
            </>
          ) : (
            <View style={styles.sectionPad}>
              <ThemedText type="small" themeColor="textSecondary">
                Google로 로그인하면 다른 기기와 자동으로 동기화됩니다. 로그인하지 않으면 데이터는 이 기기에만 저장돼요.
              </ThemedText>
              <PressableScale
                hapticKind="light"
                onPress={handleGoogleSignIn}
                disabled={signingIn}
                style={[styles.primaryButton, { backgroundColor: theme.text, opacity: signingIn ? 0.6 : 1 }]}>
                <Ionicons name="logo-google" size={16} color={theme.background} />
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  {signingIn ? '로그인 중...' : 'Google로 로그인'}
                </ThemedText>
              </PressableScale>
              {authError ? <ThemedText style={[styles.hint, { color: theme.danger }]}>{authError}</ThemedText> : null}
            </View>
          )}
        </Section>

        {session ? (
          <Section title="외부 앱 연동 (읽기 전용)">
            <View style={styles.sectionPad}>
              <ExportTokenSection />
            </View>
          </Section>
        ) : null}

        <ViewportDiagnostics />
      </ScrollView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
        {title}
      </ThemedText>
      <View style={[styles.sectionCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  iconColor,
  label,
  detail,
  onPress,
  divider,
}: {
  icon: IoniconName;
  iconColor: string;
  label: string;
  detail?: string;
  onPress?: () => void;
  divider?: boolean;
}) {
  const theme = useTheme();
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: iconColor }]}>
        <Ionicons name={icon} size={17} color="#FFFFFF" />
      </View>
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1}>{label}</ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} /> : null}
    </>
  );
  const rowStyle = [styles.row, divider ? { borderTopWidth: 1, borderTopColor: theme.border } : null];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <PressableScale activeScale={0.98} hapticKind="selection" onPress={onPress} style={rowStyle}>
      {content}
    </PressableScale>
  );
}

/**
 * One faint line of viewport numbers (web standalone only) — the iOS PWA
 * bottom-gap bug can't be reproduced off-device, so this is what to read
 * off a real phone if the gap ever comes back. Values come from the
 * viewport-fit script in app/+html.tsx.
 */
function ViewportDiagnostics() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const info = (window as Window & {
      __viewportFit?: { innerHeight: number; screenHeight: number; safeTop: number; applied: boolean };
    }).__viewportFit;
    if (!info) return;
    setText(
      `viewport ${info.innerHeight}/${info.screenHeight} · top ${info.safeTop} · ${info.applied ? 'fit 적용' : 'fit 없음'}`,
    );
  }, []);
  if (!text) return null;
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.diagnostics}>
      {text}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  title: { fontSize: 34, lineHeight: 42, letterSpacing: -0.8 },
  section: { marginTop: 22 },
  sectionLabel: { marginBottom: 8, marginLeft: 4 },
  sectionCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  sectionPad: { padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  hint: { marginTop: 8 },
  primaryButton: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagnostics: { marginTop: 28, textAlign: 'center', fontSize: 11, opacity: 0.6 },
});
