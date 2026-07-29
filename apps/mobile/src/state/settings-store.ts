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

/**
 * 'supabase' syncs via the user's Supabase project (SupabaseSyncGateway, any
 * platform — see docs/architecture.md §5); 'rest' uses the self-hosted backend
 * (RestSyncGateway); 'off' leaves sync disabled (NoopSyncGateway).
 */
export type SyncMode = "off" | "rest" | "supabase";

interface SettingsState {
  colorSchemePreference: ColorSchemePreference;
  syncMode: SyncMode;
  /** Developer settings for local REST sync verification — docs/architecture.md §4-4/4-5. */
  syncServerUrl: string | null;
  deviceToken: string;
  /** Project URL and anon (public) key from the Supabase dashboard — docs/architecture.md §5. */
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  lastSyncedAt: string | null;
  setColorSchemePreference: (pref: ColorSchemePreference) => void;
  setSyncMode: (mode: SyncMode) => void;
  setSyncServerUrl: (url: string | null) => void;
  setDeviceToken: (token: string) => void;
  setSupabaseUrl: (url: string | null) => void;
  setSupabaseAnonKey: (key: string | null) => void;
  setLastSyncedAt: (iso: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      colorSchemePreference: "system",
      syncMode: "off",
      syncServerUrl: null,
      deviceToken: "local-dev-token",
      supabaseUrl: null,
      supabaseAnonKey: null,
      lastSyncedAt: null,
      setColorSchemePreference: (colorSchemePreference) => set({ colorSchemePreference }),
      setSyncMode: (syncMode) => set({ syncMode }),
      setSyncServerUrl: (syncServerUrl) => set({ syncServerUrl }),
      setDeviceToken: (deviceToken) => set({ deviceToken }),
      setSupabaseUrl: (supabaseUrl) => set({ supabaseUrl }),
      setSupabaseAnonKey: (supabaseAnonKey) => set({ supabaseAnonKey }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
    }),
    {
      name: "habit-tracker-settings",
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
