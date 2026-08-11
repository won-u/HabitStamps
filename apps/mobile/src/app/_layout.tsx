import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { AppState, type AppStateStatus, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import {
  NotoSansKR_400Regular,
  NotoSansKR_500Medium,
  NotoSansKR_600SemiBold,
  NotoSansKR_700Bold,
} from '@expo-google-fonts/noto-sans-kr';

import { db } from '@/data/local/client';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { runSync } from '@/composition/container';
// eslint-disable-next-line import/no-relative-parent-imports -- drizzle-kit generates this file at the project root, outside src/
import migrations from '../../drizzle/migrations';

SplashScreen.preventAutoHideAsync();

/**
 * Syncs on launch and every background/inactive → active transition, so
 * changes made on another device show up without the user doing anything.
 * `runSync()` itself is a no-op while signed out. No true OS-level background
 * execution (expo-task-manager etc.) — this only fires while the app is open
 * or being brought back to the foreground, which is enough for a habit
 * tracker that's only ever interacted with in the foreground anyway.
 */
function useAutoSyncOnForeground() {
  useEffect(() => {
    void runSync();
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') void runSync();
    });
    return () => subscription.remove();
  }, []);
}

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const [fontsLoaded, fontError] = useFonts({
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_600SemiBold,
    NotoSansKR_700Bold,
  });
  const theme = useTheme();
  useAutoSyncOnForeground();

  useEffect(() => {
    if ((success || error) && (fontsLoaded || fontError)) {
      SplashScreen.hideAsync();
    }
  }, [success, error, fontsLoaded, fontError]);

  if (error) {
    return (
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.center}>
          <ThemedText>DB 마이그레이션 오류: {error.message}</ThemedText>
        </View>
      </GestureHandlerRootView>
    );
  }

  if (!success || !(fontsLoaded || fontError)) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="habit/new" options={{ presentation: 'modal', title: '습관 추가' }} />
        <Stack.Screen name="habit/[id]/index" options={{ title: '습관' }} />
        <Stack.Screen name="habit/[id]/edit" options={{ presentation: 'modal', title: '습관 수정' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
