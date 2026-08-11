import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import type { TodayHabit } from '@/features/today/use-today';

interface Props {
  item: TodayHabit;
  onToggle: () => void;
}

/**
 * DayStamps-style card: the whole row is filled with the habit's own color,
 * and checking it swaps the card to a neutral gray with a filled checkmark —
 * the color-to-gray transition IS the "done" feedback (docs/ux-design.md §1,
 * refined against the DayStamps reference captures).
 */
export const HabitCard = memo(function HabitCard({ item, onToggle }: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const { habit, isCheckedForViewedDate, subtitle, periodProgress } = item;

  const animatedCircleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function handleTogglePress() {
    scale.value = withSequence(withSpring(1.2, { duration: 120 }), withSpring(1, { duration: 150 }));
    onToggle();
  }

  const cardBackground = isCheckedForViewedDate ? theme.backgroundElement : habit.color;
  const foreground = isCheckedForViewedDate ? theme.text : '#FFFFFF';
  const foregroundMuted = isCheckedForViewedDate ? theme.textSecondary : 'rgba(255,255,255,0.78)';

  return (
    <Link href={{ pathname: '/habit/[id]', params: { id: habit.id } }} asChild>
      <Pressable style={StyleSheet.flatten([styles.card, { backgroundColor: cardBackground }])}>
        <Pressable onPress={handleTogglePress} hitSlop={10}>
          <Animated.View
            style={[
              styles.checkCircle,
              {
                borderColor: isCheckedForViewedDate ? theme.textSecondary : 'rgba(255,255,255,0.85)',
                backgroundColor: isCheckedForViewedDate ? theme.textSecondary : 'rgba(255,255,255,0.16)',
              },
              animatedCircleStyle,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${habit.name}, ${isCheckedForViewedDate ? '완료' : '미완료'}, 두 번 탭하여 완료 표시`}>
            {isCheckedForViewedDate ? <Ionicons name="checkmark" size={18} color={theme.background} /> : null}
          </Animated.View>
        </Pressable>

        <View style={styles.info}>
          <Text numberOfLines={1} style={[styles.name, { color: foreground }]}>
            {habit.icon} {habit.name}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: foregroundMuted }]}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.badge}>
          <Ionicons name="flag" size={12} color={foregroundMuted} />
          <Text style={[styles.badgeText, { color: foregroundMuted }]}>
            {periodProgress.count}/{periodProgress.target}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color={foregroundMuted} />
      </Pressable>
    </Link>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 12,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 1 },
  name: { fontSize: 16, lineHeight: 20, fontFamily: 'NotoSansKR_700Bold' },
  subtitle: { fontSize: 13, lineHeight: 16, fontFamily: 'NotoSansKR_500Medium' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 13, fontFamily: 'NotoSansKR_700Bold' },
});
