import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();

  // Flattened to a single object, not an array — expo-router's <Slot> (used by
  // Tabs/Stack to render the active screen) errors if the screen's root
  // element receives an array `style` prop.
  return <View style={StyleSheet.flatten([{ backgroundColor: theme[type ?? 'background'] }, style])} {...otherProps} />;
}
