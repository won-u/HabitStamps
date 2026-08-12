import type { SyncChangeSet } from "./change-set";

export interface SyncPushResult {
  acceptedAt: string;
  /** ids that lost last-write-wins on the server and were NOT applied; will come back via the next pull */
  conflicts: string[];
  /**
   * ids whose entity type's upsert RPC couldn't even be attempted this round
   * (e.g. a network drop between the habits and check-ins calls) — distinct
   * from `conflicts`: these were never evaluated against LWW at all, so they
   * stay `pending` and are retried on the next push, instead of being
   * (wrongly) marked synced or permanently stuck as a conflict. See
   * docs/code-review-2026-08-12.md Major #4.
   */
  failedIds: string[];
}

export interface SyncPullResult {
  serverTime: string;
  changes: SyncChangeSet;
}

/**
 * Strategy interface the mobile app's SyncEngine talks to. The local repository
 * is always the source of truth; this is a separate layer that only moves data
 * in and out of it. See docs/architecture.md §3-3.
 *
 * v1 ships one implementation, SupabaseSyncGateway (this app's one fixed
 * Supabase project, scoped per user by RLS — see docs/architecture.md §5).
 * When signed out, `runSync()` returns before ever constructing a gateway —
 * there used to be a NoopSyncGateway for that case, but it stamped
 * `lastSyncedAt` with "now" on every no-op call, which poisoned the
 * incremental-pull watermark for the first sync after a later login.
 */
export interface SyncGateway {
  push(changes: SyncChangeSet): Promise<SyncPushResult>;
  pull(sinceIso: string): Promise<SyncPullResult>;
}
