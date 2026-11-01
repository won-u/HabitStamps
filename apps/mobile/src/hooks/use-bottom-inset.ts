import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Standard iOS home indicator reservation — no real device's is taller.
const IOS_HOME_INDICATOR_INSET = 34;
// Defensive cap for the native platform's own insets.bottom.
const MAX_BOTTOM_INSET = 40;

function detectStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

/**
 * The bottom safe-area inset, normalized across platforms.
 *
 * On web, `env(safe-area-inset-bottom)` has been observed to be unreliable in
 * an installed iOS standalone PWA (git log: bc85802, 53b3dd0), so standalone
 * web uses the platform-standard home-indicator value and a plain browser
 * tab uses 0 (Safari's own toolbar already owns that space). Native uses the
 * real inset, capped.
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  const [standalone, setStandalone] = useState(false);
  useEffect(() => setStandalone(detectStandalone()), []);
  if (Platform.OS === 'web') return standalone ? IOS_HOME_INDICATOR_INSET : 0;
  return Math.min(insets.bottom, MAX_BOTTOM_INSET);
}

export const TAB_BAR_HEIGHT = 62;
const MIN_TAB_BAR_GAP = 12;
// The floating bar tucks partly into the home-indicator zone (like iOS 26's
// own floating tab bar) instead of sitting fully above it — that zone has
// nothing interactive in it, and stacking a full 34pt gap under the bar is
// exactly what made the old bar look like it had a big empty band below it.
const HOME_INDICATOR_OVERLAP = 14;

/** Distance from the screen's bottom edge to the floating tab bar's bottom edge. */
export function useTabBarBottomOffset(): number {
  const bottomInset = useBottomInset();
  return Math.max(MIN_TAB_BAR_GAP, bottomInset - HOME_INDICATOR_OVERLAP);
}

/**
 * Bottom padding a tab screen's scroll content needs so its last row can
 * scroll clear of the floating tab bar (content otherwise scrolls *under*
 * the translucent bar, which is intended).
 */
export function useTabBarSpace(): number {
  return useTabBarBottomOffset() + TAB_BAR_HEIGHT + 20;
}
