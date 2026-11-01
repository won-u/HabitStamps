import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

const PADDING = 3;
const THUMB_SPRING = { damping: 20, stiffness: 260, mass: 0.7 };

/** iOS-style segmented control: equal-width segments with a thumb that springs to the selected one. */
export function SegmentedControl<T extends string>({ options, value, onChange, style }: Props<T>) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const segmentWidth = width > 0 ? (width - PADDING * 2) / options.length : 0;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const thumbStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: withSpring(segmentWidth * selectedIndex, THUMB_SPRING) }],
  }));

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: theme.backgroundSelected }, style]}>
      {segmentWidth > 0 ? (
        <Animated.View style={[styles.thumb, { backgroundColor: theme.segmentThumb }, thumbStyle]} />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              haptic('selection');
              onChange(option.value);
            }}
            style={styles.segment}>
            <ThemedText
              type="small"
              numberOfLines={1}
              style={[styles.label, selected ? styles.labelSelected : null, { color: selected ? theme.text : theme.textSecondary }]}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 14, padding: PADDING },
  thumb: {
    position: 'absolute',
    top: PADDING,
    bottom: PADDING,
    left: PADDING,
    borderRadius: 11,
    boxShadow: Shadows.card,
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  label: { fontSize: 13.5 },
  labelSelected: { fontFamily: 'NotoSansKR_700Bold' },
});
