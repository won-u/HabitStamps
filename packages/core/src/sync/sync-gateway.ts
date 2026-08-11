import type { SyncChangeSet } from "./change-set";

export interface SyncPushResult {
  acceptedAt: string;
  /** ids that lost last-write-wins on the server and were NOT applied; will come back via the next pull */
  conflicts: string[];
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
