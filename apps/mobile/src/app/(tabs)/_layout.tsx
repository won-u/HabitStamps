import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

const TAB_BAR_ICON_HEIGHT = 49;
// Standard iOS home indicator reservation — no real device's is taller.
const IOS_HOME_INDICATOR_INSET = 34;
// Generous upper bound for the *native* platform's own insets.bottom
// (should never legitimately exceed IOS_HOME_INDICATOR_INSET, kept as a
// defensive cap regardless).
const MAX_BOTTOM_INSET = 40;

/**
 * On web, `useSafeAreaInsets()` reads `env(safe-area-inset-bottom)`, which
 * empirically has been observed to differ between an installed standalone
 * PWA and the same page open in a regular Safari tab on iOS — in a plain
 * Safari tab this device reports ~0 (Safari's own chrome occupies that
 * space) while the installed PWA reports something clearly larger than the
 * real 34pt home indicator (confirmed: a real device screenshot measured a
 * gap far bigger than 34pt even after clamping insets.bottom to 40px here,
 * meaning the *reported* value itself — not just an unclamped one — is the
 * problem specifically in standalone mode). Since the app only ever ships
 * as a standalone PWA on web (docs/architecture.md §3-5) and never as a
 * bare browser tab in practice, hardcoding the platform-standard value for
 * web sidesteps that unreliable measurement entirely rather than trusting
 * whatever the browser reports.
 */
function useStandaloneDisplayMode(): boolean {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    setStandalone(window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true);
  }, []);
  return standalone;
}

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isStandaloneWeb = useStandaloneDisplayMode();
  const bottomInset =
    Platform.OS === 'web'
      ? isStandaloneWeb
        ? IOS_HOME_INDICATOR_INSET
        : 0
      : Math.min(insets.bottom, MAX_BOTTOM_INSET);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.background,
          height: TAB_BAR_ICON_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
        },
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textSecondary,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '오늘',
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-circle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: '캘린더',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: '통계',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
