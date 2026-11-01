import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

interface Props {
  /** 0–1 */
  progress: number;
  color: string;
  height?: number;
  trackColor?: string;
  /** Stagger the initial fill when several bars appear together. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/** Rounded bar that springs to its value (and re-springs whenever the value changes). */
export function ProgressBar({ progress, color, height = 6, trackColor, delay = 0, style }: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const fill = useSharedValue(0);
  const clamped = Math.min(1, Math.max(0, progress));

  useEffect(() => {
    fill.value = withDelay(delay, withSpring(clamped, { damping: 22, stiffness: 140 }));
  }, [clamped, delay, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: Math.max(0, fill.value) * width }));

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor ?? theme.backgroundSelected }, style]}>
      <Animated.View style={[styles.fill, { borderRadius: height / 2, backgroundColor: color }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
  fill: { height: '100%' },
});
