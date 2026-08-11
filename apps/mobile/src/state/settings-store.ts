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
  setColorSchemePreference: (pref: ColorSchemePreference) => void;
  setLastSyncedAt: (iso: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      colorSchemePreference: "system",
      lastSyncedAt: null,
      setColorSchemePreference: (colorSchemePreference) => set({ colorSchemePreference }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
    }),
    {
      name: "habit-tracker-settings",
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
