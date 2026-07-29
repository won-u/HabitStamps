import { emptySyncChangeSet } from "@habit-tracker/core";
import type { SyncChangeSet, SyncGateway, SyncPullResult, SyncPushResult } from "@habit-tracker/core";

/** Default gateway when no backend URL is configured — v1 stays purely local. */
export class NoopSyncGateway implements SyncGateway {
  async push(_changes: SyncChangeSet): Promise<SyncPushResult> {
    return { acceptedAt: new Date().toISOString(), conflicts: [] };
  }

  async pull(_sinceIso: string): Promise<SyncPullResult> {
    return { serverTime: new Date().toISOString(), changes: emptySyncChangeSet() };
  }
}
