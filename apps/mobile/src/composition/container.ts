import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncGateway } from "@habit-tracker/core";

import { LocalHabitRepository } from "@/data/local/habit-repository";
import { LocalCheckInRepository } from "@/data/local/check-in-repository";
import { LocalCategoryRepository } from "@/data/local/category-repository";
import { NoopSyncGateway } from "@/data/sync/noop-sync-gateway";
import { SupabaseSyncGateway } from "@/data/sync/supabase-sync-gateway";
import { SyncEngine } from "@/data/sync/sync-engine";
import { getSupabaseClient } from "@/data/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/constants/supabase";
import { useSettingsStore } from "@/state/settings-store";

const MUTATING_METHODS = new Set(["create", "update", "softDelete"]);

/**
 * Wraps a repository so every local write (create/update/softDelete)
 * schedules a background sync — screens keep calling these methods exactly
 * as before and get auto-sync for free. Sync-engine-internal writes
 * (findPendingSync/markSynced/applyRemoteChanges/applyRemoteDeletes) are
 * deliberately excluded so a pull can't trigger another sync.
 *
 * This has to live in the same module as `scheduleSync` (not a separate
 * features/sync file) — an earlier split caused a require-cycle
 * (container.ts <-> auto-sync.ts) where Metro's interop left `scheduleSync`
 * unresolved at the time the wrapped methods were actually called, so writes
 * silently never scheduled a sync. Keeping it in one file has no cycle to get
 * wrong.
 */
function withSyncTrigger<T extends object>(repository: T): T {
  return new Proxy(repository, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || !MUTATING_METHODS.has(prop as string)) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
        scheduleSync();
        return result;
      };
    },
  }) as T;
}

// Singletons: the whole app shares one local-DB-backed repository instance
// per entity, so every screen's `observe()` sees every other screen's writes.
export const habitRepository = withSyncTrigger(new LocalHabitRepository());
export const checkInRepository = withSyncTrigger(new LocalCheckInRepository());
export const categoryRepository = new LocalCategoryRepository();

/** Client for this app's one fixed Supabase project — see constants/supabase.ts. */
export function getConfiguredSupabaseClient(): SupabaseClient {
  return getSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Built fresh on every sync attempt (not a singleton) because whether it's
 * signed in can change at runtime. See docs/architecture.md §3-3
 * "Composition Root".
 */
async function buildSyncEngine(): Promise<SyncEngine> {
  const client = getConfiguredSupabaseClient();
  const { data } = await client.auth.getSession();

  const gateway: SyncGateway = data.session ? new SupabaseSyncGateway(client) : new NoopSyncGateway();

  return new SyncEngine(habitRepository, checkInRepository, gateway);
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight = false;

/**
 * Runs one push+pull cycle. Safe to call often and from multiple triggers
 * (login, app foreground, local writes) — `buildSyncEngine()` resolves to a
 * NoopSyncGateway when signed out, and `syncInFlight` collapses overlapping
 * calls into one. Failures (offline, transient network errors) are swallowed
 * on purpose: local rows stay `syncStatus: 'pending'` either way, so the next
 * trigger retries them — no error banner/retry UI needed (see
 * docs/features.md's "화려한 시각화보다 통계 계산의 신뢰도" principle).
 */
export async function runSync(): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const engine = await buildSyncEngine();
    const since = useSettingsStore.getState().lastSyncedAt ?? new Date(0).toISOString();
    const result = await engine.syncNow(since);
    useSettingsStore.getState().setLastSyncedAt(result.serverTime);
  } catch {
    // Offline or transient failure — retried on the next trigger.
  } finally {
    syncInFlight = false;
  }
}

/**
 * Debounced entry point for local-write triggers (habit/check-in
 * create/update/softDelete) — coalesces a burst of taps (e.g. checking off
 * several habits in a row) into one sync instead of one per write.
 */
export function scheduleSync(delayMs = 1500): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void runSync();
  }, delayMs);
}
