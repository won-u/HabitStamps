import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { HabitPalette, Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PIECES = 36;
const DURATION = 1800;

interface Props {
  /** Bump this to fire a new burst (0 = nothing yet). */
  trigger: number;
  /** Habit colors to paint the confetti with; falls back to the palette. */
  colors: readonly string[];
  message: string;
}

/**
 * One-shot confetti shower + toast, shown when the last habit of the viewed
 * day gets checked off (docs/ux-design.md §7 listed this as a known gap).
 * Purely decorative: pointerEvents="none" so it never blocks a tap.
 */
export function Celebration({ trigger, colors, message }: Props) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (trigger === 0) return;
    setShown(trigger);
    const timer = setTimeout(() => setShown(0), DURATION + 600);
    return () => clearTimeout(timer);
  }, [trigger]);

  if (shown === 0) return null;
  return <Burst key={shown} colors={colors} message={message} />;
}

function Burst({ colors, message }: { colors: readonly string[]; message: string }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const palette = colors.length > 0 ? colors : HabitPalette.map((swatch) => swatch.hex);

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, index) => ({
        key: index,
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 120,
        delay: Math.random() * 260,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        size: 6 + Math.random() * 6,
        round: Math.random() > 0.6,
        color: palette[index % palette.length]!,
      })),
    // Fixed for the lifetime of this burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map(({ key, ...piece }) => (
        <ConfettiPiece key={key} {...piece} fall={height * 0.75} />
      ))}
      <Animated.View
        entering={FadeInUp.springify().damping(16)}
        exiting={FadeOutUp.duration(250)}
        style={[styles.toast, { backgroundColor: theme.text }]}>
        <ThemedText type="smallBold" style={{ color: theme.background }}>
          {message}
        </ThemedText>
      </Animated.View>
    </View>
  );
}

function ConfettiPiece({
  x,
  drift,
  delay,
  spin,
  size,
  round,
  color,
  fall,
}: {
  x: number;
  drift: number;
  delay: number;
  spin: number;
  size: number;
  round: boolean;
  color: string;
  fall: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }));
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : t.value > 0.75 ? (1 - t.value) / 0.25 : 1,
    transform: [
      { translateX: x + drift * t.value },
      { translateY: -20 + fall * t.value },
      { rotate: `${spin * t.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        { width: size, height: round ? size : size * 0.45, borderRadius: round ? size / 2 : 1.5, backgroundColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0, left: 0 },
  toast: {
    position: 'absolute',
    top: 64,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    boxShadow: Shadows.floating,
  },
});
