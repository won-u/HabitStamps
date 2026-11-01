import type { SupabaseClient } from "@supabase/supabase-js";

import { LocalHabitRepository } from "@/data/local/habit-repository";
import { LocalCheckInRepository } from "@/data/local/check-in-repository";
import { LocalCategoryRepository } from "@/data/local/category-repository";
import { SupabaseSyncGateway } from "@/data/sync/supabase-sync-gateway";
import { SyncEngine } from "@/data/sync/sync-engine";
import { getSupabaseClient } from "@/data/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/constants/supabase";
import { useSettingsStore } from "@/state/settings-store";

// `toggle` is the check-in tap itself: it writes through its own internal
// create/soft-delete (on the unwrapped repository), so it must be listed here
// or checking a habit off never scheduled a sync.
const MUTATING_METHODS = new Set(["create", "update", "softDelete", "toggle"]);

/**
 * Wraps a repository so every local write (create/update/softDelete/toggle)
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
export const categoryRepository = withSyncTrigger(new LocalCategoryRepository());

/** Client for this app's one fixed Supabase project — see constants/supabase.ts. */
export function getConfiguredSupabaseClient(): SupabaseClient {
  return getSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * 2 (2026-11-01): pull reads by server_updated_at and pages past the
 * 1000-row cap. Pulls before that could skip rows for good — anything past
 * the first 1000 of a full pull, and changes pushed late from an offline
 * device — so a device still on format 1 pulls everything once.
 */
const SYNC_FORMAT = 2;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight = false;
/** A sync was asked for while one was running: run once more when it ends. */
let syncRequestedDuringFlight = false;

/**
 * Runs one push+pull cycle. Safe to call often and from multiple triggers
 * (login, app foreground, local writes) — `syncInFlight` collapses
 * overlapping calls into one follow-up run after the current one. Failures (offline, transient network errors)
 * are swallowed on purpose: local rows stay `syncStatus: 'pending'` either
 * way, so the next trigger retries them — no error banner/retry UI needed
 * (see docs/features.md's "화려한 시각화보다 통계 계산의 신뢰도" principle).
 *
 * Returns immediately without touching `lastSyncedAt` when signed out — this
 * used to fall through to a NoopSyncGateway that still stamped `lastSyncedAt`
 * with "now" on every foreground/launch trigger. That poisoned the
 * incremental-pull watermark: by the time the user actually logged in,
 * `lastSyncedAt` was already recent (from the logged-out foreground syncs),
 * so the post-login pull's `updated_at > lastSyncedAt` filter skipped every
 * pre-existing habit/check-in already on the server — login appeared to
 * "do nothing". Never persisting a watermark for a sync that didn't happen
 * keeps the first post-login sync starting from epoch, as intended.
 */
export async function runSync(): Promise<void> {
  if (syncInFlight) {
    // Dropping this call lost a write made during the running sync until
    // the next app foreground: that sync had already read its pending rows.
    syncRequestedDuringFlight = true;
    return;
  }
  syncInFlight = true;
  syncRequestedDuringFlight = false;
  try {
    const client = getConfiguredSupabaseClient();
    const { data } = await client.auth.getSession();
    if (!data.session) return;

    const engine = new SyncEngine(habitRepository, checkInRepository, categoryRepository, new SupabaseSyncGateway(client));
    const settings = useSettingsStore.getState();
    const watermark = settings.syncFormat === SYNC_FORMAT ? settings.lastSyncedAt : null;
    const since = watermark ?? new Date(0).toISOString();
    const result = await engine.syncNow(since);
    useSettingsStore.getState().setLastSyncedAt(result.serverTime);
    useSettingsStore.getState().setSyncFormat(SYNC_FORMAT);
  } catch {
    // Offline or transient failure — retried on the next trigger.
  } finally {
    syncInFlight = false;
    if (syncRequestedDuringFlight) scheduleSync(0);
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
