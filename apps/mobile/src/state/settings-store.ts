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
  /** Developer settings for local sync verification — docs/architecture.md §4-4/4-5. */
  syncServerUrl: string | null;
  deviceToken: string;
  lastSyncedAt: string | null;
  setColorSchemePreference: (pref: ColorSchemePreference) => void;
  setSyncServerUrl: (url: string | null) => void;
  setDeviceToken: (token: string) => void;
  setLastSyncedAt: (iso: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      colorSchemePreference: "system",
      syncServerUrl: null,
      deviceToken: "local-dev-token",
      lastSyncedAt: null,
      setColorSchemePreference: (colorSchemePreference) => set({ colorSchemePreference }),
      setSyncServerUrl: (syncServerUrl) => set({ syncServerUrl }),
      setDeviceToken: (deviceToken) => set({ deviceToken }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
    }),
    {
      name: "habit-tracker-settings",
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
