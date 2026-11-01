import { forwardRef } from 'react';
import { Pressable, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic, type HapticKind } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.6 };

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far to shrink while pressed (1 = no shrink). */
  activeScale?: number;
  /** Fire a haptic tick on press (synchronously, inside the tap — required for the iOS web trick). */
  hapticKind?: HapticKind | false;
};

/**
 * The app's default tappable surface: springs down slightly while held and
 * back on release, so every button/chip/cell gives immediate physical
 * feedback instead of the flat "nothing happens until the screen changes"
 * feel of a bare Pressable.
 */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { style, activeScale = 0.96, hapticKind = false, onPressIn, onPressOut, onPress, disabled, ...rest },
  ref,
) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={(event) => {
        scale.value = withSpring(activeScale, PRESS_SPRING);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, PRESS_SPRING);
        onPressOut?.(event);
      }}
      onPress={(event) => {
        if (hapticKind) haptic(hapticKind);
        onPress?.(event);
      }}
      style={[style, animatedStyle]}
      {...rest}
    />
  );
});
