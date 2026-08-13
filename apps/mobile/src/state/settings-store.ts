import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ColorSchemePreference = "system" | "light" | "dark";

interface SettingsState {
  colorSchemePreference: ColorSchemePreference;
  /** Timestamp of the last successful sync, used as the `since` cursor for the next pull. */
  lastSyncedAt: string | null;
  /**
   * Where the synthetic "기본" (uncategorized) group sits among the Today
   * screen's category groups — categories have a real, synced `sortOrder`
   * column, but "기본" isn't a Category row, so its position is a per-device
   * preference instead. -1 sorts it before any category (today's default
   * behavior) until the user drags it somewhere else.
   */
  defaultGroupSortOrder: number;
  setColorSchemePreference: (pref: ColorSchemePreference) => void;
  setLastSyncedAt: (iso: string | null) => void;
  setDefaultGroupSortOrder: (order: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      colorSchemePreference: "system",
      lastSyncedAt: null,
      defaultGroupSortOrder: -1,
      setColorSchemePreference: (colorSchemePreference) => set({ colorSchemePreference }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
      setDefaultGroupSortOrder: (defaultGroupSortOrder) => set({ defaultGroupSortOrder }),
    }),
    {
      // expo-secure-store's web implementation is a no-op ({} exported as
      // the default), so this store's persistence silently did nothing on
      // web — every page load reset lastSyncedAt to null, which forces a
      // full resync instead of an incremental one (docs/code-review-2026-08-12.md
      // Major "웹 빌드에서 expo-secure-store가 사실상 no-op"). None of this
      // store's fields are secret (unlike the Supabase session, which does
      // need SecureStore's native encryption where available), so
      // AsyncStorage — already used for the Supabase session for the same
      // "actually works everywhere" reason (see data/supabase/client.ts) —
      // is strictly the right fit here, not just a web workaround.
      name: "habit-tracker-settings",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
