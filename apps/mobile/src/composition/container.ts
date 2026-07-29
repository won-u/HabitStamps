import { LocalHabitRepository } from "@/data/local/habit-repository";
import { LocalCheckInRepository } from "@/data/local/check-in-repository";
import { LocalCategoryRepository } from "@/data/local/category-repository";
import { NoopSyncGateway } from "@/data/sync/noop-sync-gateway";
import { RestSyncGateway } from "@/data/sync/rest-sync-gateway";
import { SyncEngine } from "@/data/sync/sync-engine";
import { useSettingsStore } from "@/state/settings-store";

// Singletons: the whole app shares one local-DB-backed repository instance
// per entity, so every screen's `observe()` sees every other screen's writes.
export const habitRepository = new LocalHabitRepository();
export const checkInRepository = new LocalCheckInRepository();
export const categoryRepository = new LocalCategoryRepository();

/**
 * Built fresh on every sync attempt (not a singleton) because the gateway it
 * picks depends on the current Developer settings, which can change at
 * runtime. See docs/architecture.md §3-3 "Composition Root".
 */
export function buildSyncEngine(): SyncEngine {
  const { syncServerUrl, deviceToken } = useSettingsStore.getState();
  const gateway = syncServerUrl ? new RestSyncGateway(syncServerUrl, deviceToken) : new NoopSyncGateway();
  return new SyncEngine(habitRepository, checkInRepository, gateway);
}
