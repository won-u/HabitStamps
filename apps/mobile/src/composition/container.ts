import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncGateway } from "@habit-tracker/core";

import { LocalHabitRepository } from "@/data/local/habit-repository";
import { LocalCheckInRepository } from "@/data/local/check-in-repository";
import { LocalCategoryRepository } from "@/data/local/category-repository";
import { NoopSyncGateway } from "@/data/sync/noop-sync-gateway";
import { RestSyncGateway } from "@/data/sync/rest-sync-gateway";
import { SupabaseSyncGateway } from "@/data/sync/supabase-sync-gateway";
import { SyncEngine } from "@/data/sync/sync-engine";
import { getSupabaseClient } from "@/data/supabase/client";
import { useSettingsStore } from "@/state/settings-store";

// Singletons: the whole app shares one local-DB-backed repository instance
// per entity, so every screen's `observe()` sees every other screen's writes.
export const habitRepository = new LocalHabitRepository();
export const checkInRepository = new LocalCheckInRepository();
export const categoryRepository = new LocalCategoryRepository();

/**
 * Returns the Supabase client for the currently-configured project, or null
 * if the Developer settings don't have a URL/anon key yet. Used both here
 * and by the Settings screen (sign-in button, session status).
 */
export function getConfiguredSupabaseClient(): SupabaseClient | null {
  const { supabaseUrl, supabaseAnonKey } = useSettingsStore.getState();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return getSupabaseClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Built fresh on every sync attempt (not a singleton) because the gateway it
 * picks depends on the current Developer settings, which can change at
 * runtime. See docs/architecture.md §3-3 "Composition Root".
 */
export async function buildSyncEngine(): Promise<SyncEngine> {
  const { syncMode, syncServerUrl, deviceToken } = useSettingsStore.getState();

  let gateway: SyncGateway = new NoopSyncGateway();
  if (syncMode === "rest" && syncServerUrl) {
    gateway = new RestSyncGateway(syncServerUrl, deviceToken);
  } else if (syncMode === "supabase") {
    const client = getConfiguredSupabaseClient();
    if (client) gateway = new SupabaseSyncGateway(client);
  }

  return new SyncEngine(habitRepository, checkInRepository, gateway);
}
