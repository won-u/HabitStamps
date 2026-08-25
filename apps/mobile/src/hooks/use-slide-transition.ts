import type { ViewStyle } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const SWIPE_THRESHOLD = 50;
const SLIDE_DURATION = 200;

/**
 * Horizontal slide transition for content whose height depends on data (habit
 * count, group count, ...) rather than a fixed grid — so the 3-pane carousel
 * in use-month-slide-carousel isn't viable: there's no safe height to clip
 * neighboring panes to. Instead the current content slides fully off-screen,
 * the caller advances to the next/prev period, and the (now different) content
 * slides back in from the opposite side.
 */
export function useSlideTransition(onNext: () => void, onPrev: () => void) {
  const { width } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const isAnimating = useSharedValue(false);

  const swapIn = (direction: 1 | -1) => {
    if (direction === 1) onNext();
    else onPrev();
    translateX.value = direction === 1 ? width : -width;
    translateX.value = withTiming(0, { duration: SLIDE_DURATION }, () => {
      isAnimating.value = false;
    });
  };

  const slide = (direction: 1 | -1) => {
    'worklet';
    if (isAnimating.value) return;
    isAnimating.value = true;
    translateX.value = withTiming(direction === 1 ? -width : width, { duration: SLIDE_DURATION }, (finished) => {
      if (finished) runOnJS(swapIn)(direction);
      else isAnimating.value = false;
    });
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      if (isAnimating.value) return;
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (isAnimating.value) return;
      if (event.translationX <= -SWIPE_THRESHOLD) slide(1);
      else if (event.translationX >= SWIPE_THRESHOLD) slide(-1);
      else translateX.value = withTiming(0, { duration: SLIDE_DURATION });
    });

  const animatedStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return { panGesture, animatedStyle, slide };
}
