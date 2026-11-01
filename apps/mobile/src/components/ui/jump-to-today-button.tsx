import { StyleSheet } from 'react-native';
import Animated, { FadeOutDown, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TAB_BAR_HEIGHT, useBottomInset, useTabBarBottomOffset } from '@/hooks/use-bottom-inset';

interface Props {
  visible: boolean;
  onPress: () => void;
  /** Screens inside the tab navigator float it above the tab bar; stack screens sit it above the home indicator. */
  aboveTabBar?: boolean;
}

/** Floating "오늘" pill shown while browsing a period other than the current one. */
export function JumpToTodayButton({ visible, onPress, aboveTabBar = true }: Props) {
  const theme = useTheme();
  const tabBarOffset = useTabBarBottomOffset();
  const bottomInset = useBottomInset();
  const bottom = aboveTabBar ? tabBarOffset + TAB_BAR_HEIGHT + 12 : bottomInset + 20;

  if (!visible) return null;
  return (
    <Animated.View
      entering={ZoomIn.springify().damping(15)}
      exiting={FadeOutDown.duration(180)}
      style={[styles.wrapper, { bottom }]}>
      <PressableScale
        hapticKind="light"
        onPress={onPress}
        accessibilityLabel="오늘로 이동"
        style={[styles.button, { backgroundColor: theme.text }]}>
        <Ionicons name="arrow-undo" size={15} color={theme.background} />
        <ThemedText type="smallBold" style={{ color: theme.background }}>
          오늘
        </ThemedText>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', right: 20 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 21,
    boxShadow: Shadows.floating,
  },
});
