import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { format } from 'date-fns';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';

interface Props {
  panes: readonly Date[];
  containerWidth: number;
  viewportHeight: number;
  panGesture: PanGesture;
  trackStyle: AnimatedStyle<ViewStyle>;
  renderMonth: (month: Date) => ReactNode;
}

/** Renders the swipeable 3-pane track for use-month-slide-carousel — one shared layout for every screen that pages a month grid. */
export function MonthSlideTrack({ panes, containerWidth, viewportHeight, panGesture, trackStyle, renderMonth }: Props) {
  return (
    <View style={[styles.viewport, { width: containerWidth, height: viewportHeight }]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.track, { width: containerWidth * 3 }, trackStyle]}>
          {panes.map((paneMonth) => (
            <View key={format(paneMonth, 'yyyy-MM')} style={{ width: containerWidth }}>
              {renderMonth(paneMonth)}
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
  track: { flexDirection: 'row' },
});
