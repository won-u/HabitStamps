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
 * v1 ships two implementations:
 * - NoopSyncGateway: signed out, push/pull are no-ops (default).
 * - SupabaseSyncGateway: this app's one fixed Supabase project, scoped per
 *   user by RLS — see docs/architecture.md §5.
 */
export interface SyncGateway {
  push(changes: SyncChangeSet): Promise<SyncPushResult>;
  pull(sinceIso: string): Promise<SyncPullResult>;
}
