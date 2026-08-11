import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";

const secureStorage: StateStorage = {
  getItem: async (name) => (await SecureStore.getItemAsync(name)) ?? null,
  setItem: async (name, value) => {
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name) => {
    await SecureStore.deleteItemAsync(name);
  },
};

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
      name: "habit-tracker-settings",
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
