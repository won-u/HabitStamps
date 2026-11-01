/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Background/Surface tokens from docs/ux-design.md §4. `backgroundElement` is
// the "Surface" (card) color; kept under its original key so existing
// ThemedText/ThemedView usages don't need to change.
export const Colors = {
  light: {
    text: '#15161B',
    // Cool off-white (iOS grouped-background family) so pure-white cards
    // actually lift off the page instead of blending into a warm beige.
    background: '#F2F3F7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6E7EE',
    textSecondary: '#6B6D78',
    accent: '#5B5FE8',
    danger: '#E5484D',
    border: 'rgba(21,22,27,0.07)',
    /** Translucent fill for floating chrome (tab bar) — paired with a backdrop blur on web. */
    chrome: 'rgba(255,255,255,0.78)',
    /** Selected-segment thumb — must read as *raised* against `backgroundSelected`. */
    segmentThumb: '#FFFFFF',
  },
  dark: {
    // A hair of blue in the near-black (not flat gray) reads less "default dark mode".
    text: '#F3F3F6',
    background: '#0D0E12',
    backgroundElement: '#191B22',
    backgroundSelected: '#262933',
    textSecondary: '#9497A3',
    accent: '#8A8DFF',
    danger: '#FF6369',
    border: 'rgba(255,255,255,0.07)',
    chrome: 'rgba(28,30,38,0.78)',
    segmentThumb: '#3A3E4B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * The 12-color habit tag palette from docs/ux-design.md §4 — the only place
 * color carries meaning in the app (habits pick one of these; everything
 * else is neutral). Kept flat (not light/dark variants) since these hues
 * read fine on both background tones as-is.
 */
export const HabitPalette = [
  { name: 'Coral', hex: '#FF6B5E' },
  { name: 'Amber', hex: '#F5A623' },
  { name: 'Lime', hex: '#A0C93D' },
  { name: 'Teal', hex: '#2FBFA0' },
  { name: 'Mint', hex: '#3DDC97' },
  { name: 'Ocean', hex: '#2E9CCA' },
  { name: 'Sky', hex: '#4FA8E8' },
  { name: 'Indigo', hex: '#6C6FE0' },
  { name: 'Violet', hex: '#B168D6' },
  { name: 'Pink', hex: '#F26FA0' },
  { name: 'Slate', hex: '#7C8A9E' },
  { name: 'Rose', hex: '#E85D75' },
] as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

/** Soft, layered elevation — `boxShadow` is supported by both RN (new arch) and react-native-web. */
export const Shadows = {
  card: '0px 1px 2px rgba(16,18,27,0.04), 0px 6px 16px rgba(16,18,27,0.06)',
  floating: '0px 2px 6px rgba(16,18,27,0.08), 0px 14px 36px rgba(16,18,27,0.16)',
} as const;

/** Tinted glow under a colored element (e.g. a habit card) — `color` is a #RRGGBB hex. */
export function tintedShadow(color: string, alpha = 0.32): string {
  return `0px 8px 20px ${withAlpha(color, alpha)}`;
}

/** `#RRGGBB` + 0–1 alpha → `rgba(...)`. Leaves non-hex input untouched. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const value = parseInt(match[1]!, 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}
