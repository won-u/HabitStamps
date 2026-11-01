import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, type Tabs } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TAB_BAR_HEIGHT, useTabBarBottomOffset } from '@/hooks/use-bottom-inset';
import { haptic } from '@/lib/haptics';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  index: { active: 'checkmark-circle', inactive: 'checkmark-circle-outline' },
  calendar: { active: 'calendar', inactive: 'calendar-outline' },
  stats: { active: 'stats-chart', inactive: 'stats-chart-outline' },
  settings: { active: 'settings', inactive: 'settings-outline' },
};

const BAR_PADDING = 5;
const INDICATOR_SPRING = { damping: 19, stiffness: 230, mass: 0.8 };

// Frosted-glass backdrop; web-only style key (react-native-web passes it
// through with the -webkit- prefix Safari still needs).
const glassStyle = (Platform.OS === 'web'
  ? { backdropFilter: 'blur(22px) saturate(180%)' }
  : {}) as unknown as ViewStyle;

/**
 * Floating, translucent pill tab bar (replaces the stock full-width bar).
 * Screens scroll underneath it — see `useTabBarSpace()` for the bottom
 * padding they reserve — and the active tab is marked by a pill that
 * springs between items. The round "+" beside it is the app-wide
 * "new habit" action (formerly a FAB plus a header button on Today only).
 */
export function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const theme = useTheme();
  const bottomOffset = useTabBarBottomOffset();
  const [barWidth, setBarWidth] = useState(0);
  const itemWidth = barWidth > 0 ? (barWidth - BAR_PADDING * 2) / state.routes.length : 0;

  const indicatorX = useSharedValue(0);
  useEffect(() => {
    indicatorX.value = withSpring(itemWidth * state.index, INDICATOR_SPRING);
  }, [itemWidth, state.index, indicatorX]);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: indicatorX.value }] }));

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: bottomOffset }]}>
      <View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={[styles.bar, glassStyle, { backgroundColor: theme.chrome, borderColor: theme.border }]}>
        {itemWidth > 0 ? (
          <Animated.View
            style={[styles.indicator, { width: itemWidth, backgroundColor: theme.backgroundSelected }, indicatorStyle]}
          />
        ) : null}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const options = descriptors[route.key]?.options;
          const label = typeof options?.title === 'string' ? options.title : route.name;
          const icons = TAB_ICONS[route.name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };

          return (
            <TabItem
              key={route.key}
              label={label}
              focused={focused}
              icon={focused ? icons.active : icons.inactive}
              color={focused ? theme.text : theme.textSecondary}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  haptic('selection');
                  navigation.navigate(route.name, route.params);
                }
              }}
            />
          );
        })}
      </View>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="새 습관 추가"
        activeScale={0.9}
        hapticKind="light"
        onPress={() => router.push('/habit/new')}
        style={[styles.addButton, { backgroundColor: theme.text }]}>
        <Ionicons name="add" size={30} color={theme.background} />
      </PressableScale>
    </View>
  );
}

function TabItem({
  label,
  focused,
  icon,
  color,
  onPress,
}: {
  label: string;
  focused: boolean;
  icon: IoniconName;
  color: string;
  onPress: () => void;
}) {
  const iconScale = useSharedValue(1);
  useEffect(() => {
    if (focused) iconScale.value = withSequence(withSpring(1.18, { duration: 140 }), withSpring(1, { duration: 220 }));
  }, [focused, iconScale]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.item}>
      <Animated.View style={iconStyle}>
        <Ionicons name={icon} size={23} color={color} />
      </Animated.View>
      <ThemedText style={[styles.label, { color }, focused ? styles.labelFocused : null]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bar: {
    flex: 1,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: BAR_PADDING,
    boxShadow: Shadows.floating,
  },
  indicator: {
    position: 'absolute',
    top: BAR_PADDING,
    bottom: BAR_PADDING,
    left: BAR_PADDING,
    borderRadius: (TAB_BAR_HEIGHT - BAR_PADDING * 2) / 2,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  label: { fontSize: 10.5, lineHeight: 14, fontFamily: 'NotoSansKR_500Medium' },
  labelFocused: { fontFamily: 'NotoSansKR_700Bold' },
  addButton: {
    width: TAB_BAR_HEIGHT,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: Shadows.floating,
  },
});
