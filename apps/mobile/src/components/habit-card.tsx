import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import type { TodayHabit } from '@/features/today/use-today';

interface Props {
  item: TodayHabit;
  onToggle: () => void;
  /**
   * Web-only drag handle (see `components/reorderable-list.tsx`'s `DragHandle`
   * doc for why web needs a small dedicated handle instead of the
   * long-press-anywhere-on-the-card gesture native uses). Omitted on native.
   */
  dragHandle?: { gesture: PanGesture; isDragging: boolean };
}

/**
 * DayStamps-style card: the whole row is filled with the habit's own color,
 * and checking it swaps the card to a neutral gray with a filled checkmark —
 * the color-to-gray transition IS the "done" feedback (docs/ux-design.md §1,
 * refined against the DayStamps reference captures).
 */
export const HabitCard = memo(function HabitCard({ item, onToggle, dragHandle }: Props) {
  const theme = useTheme();
  const router = useRouter();
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
    // 웹에서 <Link asChild>는 <a href>로 렌더링되는데, iOS Safari가 앵커에
    // 거는 여러 기본 동작(롱프레스 콜아웃, 탭 하이라이트, 클릭 처리)이
    // 이 카드에 걸린 드래그 재정렬 제스처와 계속 충돌했다 — 콜아웃만 꺼도
    // 다른 동작들이 남아 드래그를 가로챘다. router.push로 프로그래밍
    // 방식 이동으로 바꿔 앵커 자체를 없애 근본적으로 해결.
    <Pressable
      style={StyleSheet.flatten([
        styles.card,
        { backgroundColor: cardBackground },
        dragHandle?.isDragging ? styles.dragging : null,
      ])}
      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}>
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

      {Platform.OS === 'web' && dragHandle ? (
        <GestureDetector gesture={dragHandle.gesture}>
          <View hitSlop={8} style={styles.dragHandle}>
            <Ionicons name="reorder-three" size={22} color={foregroundMuted} />
          </View>
        </GestureDetector>
      ) : null}

      <Ionicons name="chevron-forward" size={16} color={foregroundMuted} />
    </Pressable>
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
  dragging: { opacity: 0.85 },
  dragHandle: { padding: 2 },
});
