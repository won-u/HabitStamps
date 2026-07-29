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
    text: '#17171C',
    background: '#F9F8F6',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E7E6E9',
    textSecondary: '#6E6E76',
  },
  dark: {
    // A hair of blue in the near-black (not flat gray) reads less "default dark mode".
    text: '#F3F3F5',
    background: '#111217',
    backgroundElement: '#1B1D24',
    backgroundSelected: '#272A33',
    textSecondary: '#95969E',
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
