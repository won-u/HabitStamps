import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

const TAB_BAR_ICON_HEIGHT = 49;
// No real device's home indicator area exceeds ~34pt — this is a generous
// upper bound. It exists because some iOS PWA/standalone WebKit contexts
// have been observed reporting a larger `env(safe-area-inset-bottom)` than
// the device's actual home indicator height (confirmed: with the correct
// 34px value, our tab bar renders pixel-perfect, no extra gap — verified via
// Chrome DevTools Protocol's safe-area-inset override). Passing an explicit
// height/paddingBottom here bypasses expo-router's own
// insets.bottom-based calculation entirely, so a misreported value can't
// inflate the visible bar.
const MAX_BOTTOM_INSET = 40;

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.min(insets.bottom, MAX_BOTTOM_INSET);

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
