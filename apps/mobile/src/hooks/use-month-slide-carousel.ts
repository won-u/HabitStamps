import { useEffect, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ViewStyle } from 'react-native';
import { addMonths, subMonths } from 'date-fns';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const SWIPE_THRESHOLD = 50;
const SLIDE_DURATION = 240;

interface Options {
  month: Date;
  setMonth: Dispatch<SetStateAction<Date>>;
  containerWidth: number;
  /** Height of one grid row in px, used only to size the fixed-height viewport. */
  rowHeight: number;
  rowGap?: number;
  /** Rows a month grid can ever need (a month spans 4-6 calendar weeks depending on layout). */
  maxRows?: number;
}

/**
 * Drives a 3-pane (prev/current/next) swipeable month carousel — shared by
 * every screen that pages a bounded-height month grid (calendar tab, habit
 * detail, date picker). translateX rests at -containerWidth so the middle
 * pane fills the viewport; swiping animates to reveal a neighbor, then the
 * month state updates and translateX snaps back — invisible, since the pane
 * now centered renders the same month that was already on screen a frame
 * earlier. Not suitable for content whose height depends on data (see
 * use-slide-transition for that case).
 */
export function useMonthSlideCarousel({ month, setMonth, containerWidth, rowHeight, rowGap = 0, maxRows = 6 }: Options) {
  const prevMonth = useMemo(() => subMonths(month, 1), [month]);
  const nextMonth = useMemo(() => addMonths(month, 1), [month]);
  const viewportHeight = maxRows * rowHeight + (maxRows - 1) * rowGap;

  const translateX = useSharedValue(-containerWidth);
  const isAnimating = useSharedValue(false);

  useEffect(() => {
    translateX.value = -containerWidth;
  }, [containerWidth, translateX]);

  const commitMonth = (direction: 1 | -1) => {
    setMonth((m) => (direction === 1 ? addMonths(m, 1) : subMonths(m, 1)));
    translateX.value = -containerWidth;
    isAnimating.value = false;
  };

  const triggerSlide = (direction: 1 | -1 | 0) => {
    'worklet';
    if (isAnimating.value) return;
    isAnimating.value = true;
    if (direction === 0) {
      translateX.value = withTiming(-containerWidth, { duration: SLIDE_DURATION }, () => {
        isAnimating.value = false;
      });
      return;
    }
    const target = direction === 1 ? -containerWidth * 2 : 0;
    translateX.value = withTiming(target, { duration: SLIDE_DURATION }, (finished) => {
      if (finished) runOnJS(commitMonth)(direction);
      else isAnimating.value = false;
    });
  };

  const goToMonth = (direction: 1 | -1) => triggerSlide(direction);

  const resetToMonth = (nextValue: Date) => {
    setMonth(nextValue);
    translateX.value = -containerWidth;
    isAnimating.value = false;
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      if (isAnimating.value) return;
      translateX.value = -containerWidth + event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX <= -SWIPE_THRESHOLD) triggerSlide(1);
      else if (event.translationX >= SWIPE_THRESHOLD) triggerSlide(-1);
      else triggerSlide(0);
    });

  const carouselTrackStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return { prevMonth, nextMonth, viewportHeight, panGesture, carouselTrackStyle, goToMonth, resetToMonth };
}
