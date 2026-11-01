import { memo, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import type { TodayHabit } from '@/features/today/use-today';
import { wasDragJustEnded } from '@/components/reorderable-list';
import { tintedShadow } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.6 };
const BURST_PARTICLES = 8;

/**
 * DayStamps-style card: the whole row is filled with the habit's own color,
 * and checking it fades the card to neutral while the check button fills
 * with that color — the color-to-neutral transition IS the "done" feedback
 * (docs/ux-design.md §1). Checking also pops the button, sends a ring and a
 * small particle burst out of it, and plays a haptic tick.
 */
export const HabitCard = memo(function HabitCard({ item, onToggle, dragHandle }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const { habit, isCheckedForViewedDate: checked, subtitle, periodProgress, currentStreak } = item;

  // 0 = unchecked (habit color), 1 = checked (neutral). Animated so the
  // card *fades* between the two instead of snapping.
  const done = useSharedValue(checked ? 1 : 0);
  const cardScale = useSharedValue(1);
  const checkScale = useSharedValue(1);
  const burst = useSharedValue(0);

  useEffect(() => {
    done.value = withTiming(checked ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [checked, done]);

  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(done.value, [0, 1], [habit.color, theme.backgroundElement]),
    transform: [{ scale: cardScale.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: burst.value > 0 && burst.value < 1 ? 1 - burst.value : 0,
    transform: [{ scale: 1 + burst.value * 1.4 }],
  }));

  function handleTogglePress() {
    if (wasDragJustEnded()) return;
    const willCheck = !checked;
    haptic(willCheck ? 'medium' : 'light');
    checkScale.value = withSequence(
      withSpring(willCheck ? 1.28 : 0.85, { duration: 140 }),
      withSpring(1, { duration: 260, dampingRatio: 0.45 }),
    );
    if (willCheck) {
      burst.value = 0;
      burst.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
    }
    onToggle();
  }

  const foreground = checked ? theme.text : '#FFFFFF';
  const foregroundMuted = checked ? theme.textSecondary : 'rgba(255,255,255,0.8)';
  const progressDone = periodProgress.target > 0 && periodProgress.count >= periodProgress.target;

  return (
    // 웹에서 <Link asChild>는 <a href>로 렌더링되는데, iOS Safari가 앵커에
    // 거는 여러 기본 동작(롱프레스 콜아웃, 탭 하이라이트, 클릭 처리)이
    // 이 카드에 걸린 드래그 재정렬 제스처와 계속 충돌했다 — router.push로
    // 프로그래밍 방식 이동으로 바꿔 앵커 자체를 없앴다.
    <AnimatedPressable
      style={[
        styles.card,
        { boxShadow: checked ? 'none' : tintedShadow(habit.color, 0.28) },
        checked ? { borderColor: theme.border } : styles.cardBorderless,
        dragHandle?.isDragging ? styles.dragging : null,
        cardStyle,
      ]}
      onPressIn={() => {
        cardScale.value = withSpring(0.975, PRESS_SPRING);
      }}
      onPressOut={() => {
        cardScale.value = withSpring(1, PRESS_SPRING);
      }}
      onPress={() => {
        if (wasDragJustEnded()) return;
        router.push({ pathname: '/habit/[id]', params: { id: habit.id } });
      }}>
      {Platform.OS === 'web' && dragHandle ? (
        <GestureDetector gesture={dragHandle.gesture}>
          <View hitSlop={8} style={styles.dragHandle}>
            <Ionicons name="reorder-two" size={18} color={foregroundMuted} />
          </View>
        </GestureDetector>
      ) : null}

      <View style={[styles.iconTile, { backgroundColor: checked ? theme.backgroundSelected : 'rgba(255,255,255,0.22)' }]}>
        <Text style={styles.iconEmoji}>{habit.icon}</Text>
      </View>

      <View style={styles.info}>
        <Text numberOfLines={1} style={[styles.name, { color: foreground }]}>
          {habit.name}
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.metaChip, { backgroundColor: checked ? theme.backgroundSelected : 'rgba(0,0,0,0.12)' }]}>
            <Ionicons name={progressDone ? 'flag' : 'flag-outline'} size={10} color={foregroundMuted} />
            <Text style={[styles.metaChipText, { color: foregroundMuted }]}>
              {periodProgress.count}/{periodProgress.target}
            </Text>
          </View>
          {currentStreak > 1 ? (
            <Text style={[styles.metaText, { color: foregroundMuted }]}>🔥 {currentStreak}</Text>
          ) : null}
          <Text numberOfLines={1} style={[styles.metaText, styles.subtitle, { color: foregroundMuted }]}>
            {subtitle}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={handleTogglePress}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`${habit.name}, ${checked ? '완료' : '미완료'}, 두 번 탭하여 완료 표시`}>
        <View style={styles.checkWrap}>
          <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: habit.color }, ringStyle]} />
          <BurstParticles progress={burst} color={checked ? habit.color : '#FFFFFF'} />
          <Animated.View
            style={[
              styles.checkCircle,
              checked
                ? { backgroundColor: habit.color, borderColor: habit.color }
                : { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.9)' },
              checkStyle,
            ]}>
            {checked ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : null}
          </Animated.View>
        </View>
      </Pressable>
    </AnimatedPressable>
  );
});

/** A few dots that fly outward from the check button and fade — the small "pop" when a habit is done. */
function BurstParticles({ progress, color }: { progress: { value: number }; color: string }) {
  return (
    <>
      {Array.from({ length: BURST_PARTICLES }, (_, index) => (
        <Particle key={index} index={index} progress={progress} color={color} />
      ))}
    </>
  );
}

function Particle({ index, progress, color }: { index: number; progress: { value: number }; color: string }) {
  const angle = (index / BURST_PARTICLES) * Math.PI * 2;
  const distance = index % 2 === 0 ? 26 : 20;
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const visible = t > 0 && t < 1;
    return {
      opacity: visible ? 1 - t : 0,
      transform: [
        { translateX: Math.cos(angle) * distance * t },
        { translateY: Math.sin(angle) * distance * t },
        { scale: 1 - t * 0.6 },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.particle, { backgroundColor: color }, style]} />;
}

const CHECK_SIZE = 34;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
    marginBottom: 10,
    gap: 12,
  },
  cardBorderless: { borderColor: 'transparent' },
  iconTile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconEmoji: { fontSize: 22, lineHeight: 28 },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 16.5, lineHeight: 21, fontFamily: 'NotoSansKR_700Bold', letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  metaChipText: { fontSize: 11.5, lineHeight: 15, fontFamily: 'NotoSansKR_700Bold' },
  metaText: { fontSize: 12, lineHeight: 15, fontFamily: 'NotoSansKR_500Medium' },
  subtitle: { flexShrink: 1 },
  checkWrap: { width: CHECK_SIZE, height: CHECK_SIZE, alignItems: 'center', justifyContent: 'center' },
  checkCircle: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 2,
  },
  particle: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5 },
  dragging: { opacity: 0.85 },
  dragHandle: { paddingVertical: 4, marginRight: -4 },
});
