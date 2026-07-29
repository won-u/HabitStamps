import { useRef } from 'react';
import { PanResponder } from 'react-native';

const SWIPE_THRESHOLD = 50;

/** Horizontal swipe → prev/next, used to flip calendar months by gesture instead of only via arrow buttons. */
export function useSwipeNavigation(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5,
      onPanResponderRelease: (_evt, gestureState) => {
        if (gestureState.dx <= -SWIPE_THRESHOLD) onSwipeLeft();
        else if (gestureState.dx >= SWIPE_THRESHOLD) onSwipeRight();
      },
    }),
  ).current;

  return panResponder.panHandlers;
}
