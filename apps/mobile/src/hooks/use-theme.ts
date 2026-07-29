/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSettingsStore } from '@/state/settings-store';

export function useTheme() {
  const scheme = useColorScheme();
  const preference = useSettingsStore((state) => state.colorSchemePreference);
  const systemTheme = scheme === 'unspecified' ? 'light' : scheme;
  const theme = preference === 'system' ? systemTheme : preference;

  return Colors[theme];
}
