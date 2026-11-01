export type HapticKind = 'selection' | 'light' | 'medium' | 'success';

/**
 * iOS Safari has no Vibration API, but since iOS 18 toggling an
 * `<input type="checkbox" switch>` plays the system switch haptic — and a
 * programmatic click on its `<label>` counts, as long as it happens inside a
 * user gesture (which every caller here is: a tap handler). This is the only
 * way to get a real Taptic tick in a home-screen PWA. Elsewhere (Android
 * Chrome) the regular Vibration API is used; on anything else it's a no-op.
 */
function tapticTick(): void {
  if (typeof document === 'undefined') return;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  document.head.removeChild(label);
}

export function haptic(kind: HapticKind = 'light'): void {
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { vibrate?: Navigator['vibrate'] }) : null;
    if (nav?.vibrate) {
      nav.vibrate(kind === 'success' ? [12, 60, 12] : kind === 'medium' ? 18 : 8);
      return;
    }
    tapticTick();
    if (kind === 'success') setTimeout(tapticTick, 110);
  } catch {
    // Haptics are a nicety — never let them break the tap that triggered them.
  }
}
