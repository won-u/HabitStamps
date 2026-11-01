import * as Haptics from 'expo-haptics';

export type HapticKind = 'selection' | 'light' | 'medium' | 'success';

/** Fire-and-forget haptic feedback. Web has its own implementation in haptics.web.ts. */
export function haptic(kind: HapticKind = 'light'): void {
  const run =
    kind === 'selection'
      ? Haptics.selectionAsync()
      : kind === 'success'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  run.catch(() => {});
}
