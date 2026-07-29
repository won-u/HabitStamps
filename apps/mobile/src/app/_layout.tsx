import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { StyleSheet, View } from 'react-native';
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
// eslint-disable-next-line import/no-relative-parent-imports -- drizzle-kit generates this file at the project root, outside src/
import migrations from '../../drizzle/migrations';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const [fontsLoaded, fontError] = useFonts({
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_600SemiBold,
    NotoSansKR_700Bold,
  });
  const theme = useTheme();

  useEffect(() => {
    if ((success || error) && (fontsLoaded || fontError)) {
      SplashScreen.hideAsync();
    }
  }, [success, error, fontsLoaded, fontError]);

  if (error) {
    return (
      <View style={styles.center}>
        <ThemedText>DB 마이그레이션 오류: {error.message}</ThemedText>
      </View>
    );
  }

  if (!success || !(fontsLoaded || fontError)) {
    return null;
  }

  return (
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
      <Stack.Screen name="report" options={{ title: '리포트' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
