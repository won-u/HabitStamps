import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { getConfiguredSupabaseClient } from '@/composition/container';

type State = { kind: 'loading' } | { kind: 'none' } | { kind: 'made'; at: string } | { kind: 'unavailable' };

/**
 * A read-only link key for another app of the same user (e.g. Personal
 * Hermes keeping a copy of the habits). Only its hash is stored on the
 * server, so the key is shown once, right after it is made; making a new
 * one replaces it, and 끊기 deletes it. See docs/supabase-schema.sql's
 * "Read-only export" section.
 */
export function ExportTokenSection() {
  const theme = useTheme();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh(): Promise<void> {
    return Promise.resolve(getConfiguredSupabaseClient().rpc('export_token_created_at')).then(
      ({ data, error: rpcError }) => {
        if (rpcError) setState({ kind: 'unavailable' });
        else setState(data ? { kind: 'made', at: data as string } : { kind: 'none' });
      },
    );
  }

  useEffect(() => {
    Promise.resolve(getConfiguredSupabaseClient().rpc('export_token_created_at')).then(({ data, error: rpcError }) => {
      if (rpcError) setState({ kind: 'unavailable' });
      else setState(data ? { kind: 'made', at: data as string } : { kind: 'none' });
    });
  }, []);

  async function make() {
    setError(null);
    setCopied(false);
    const { data, error: rpcError } = await getConfiguredSupabaseClient().rpc('create_export_token');
    if (rpcError || typeof data !== 'string') {
      setError(rpcError?.message ?? '키를 만들지 못했어요');
      return;
    }
    setToken(data);
    await refresh();
  }

  async function revoke() {
    setError(null);
    const { error: rpcError } = await getConfiguredSupabaseClient().rpc('revoke_export_token');
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setToken(null);
    await refresh();
  }

  async function copy() {
    if (token && Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    }
  }

  if (state.kind === 'loading') return null;
  if (state.kind === 'unavailable') {
    return (
      <ThemedText themeColor="textSecondary" style={styles.hint}>
        서버가 아직 연동 기능을 모르는 버전이에요(관리자가 스키마를 갱신해야 해요).
      </ThemedText>
    );
  }

  return (
    <View>
      <ThemedText themeColor="textSecondary" style={styles.hint}>
        다른 앱(예: Personal Hermes)이 내 습관과 도장을 읽기만 할 수 있게 하는 키예요. 쓰기·삭제는 할 수 없어요.
        {state.kind === 'made' ? ` 지금 키: ${new Date(state.at).toLocaleDateString()}에 만듦.` : ''}
      </ThemedText>
      {token ? (
        <View style={styles.tokenBox}>
          <TextInput
            value={token}
            editable={false}
            selectTextOnFocus
            style={[styles.token, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            이 키는 지금 한 번만 보여요. 길게 눌러 복사해서 연동할 앱에 넣어 주세요.
          </ThemedText>
          {Platform.OS === 'web' ? (
            <Pressable onPress={copy} style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText>{copied ? '복사했어요' : '복사'}</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable onPress={make} style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText>{state.kind === 'made' ? '새 연동 키 만들기 (이전 키는 끊겨요)' : '연동 키 만들기'}</ThemedText>
      </Pressable>
      {state.kind === 'made' ? (
        <Pressable onPress={revoke} style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText style={{ color: '#E85D75' }}>연동 끊기</ThemedText>
        </Pressable>
      ) : null}
      {error ? <ThemedText style={[styles.hint, { color: '#E85D75' }]}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: 8 },
  tokenBox: { marginTop: 12, gap: 6 },
  token: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13 },
  button: { marginTop: 12, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
});
