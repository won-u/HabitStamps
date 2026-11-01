/** Identifies exactly which local write a push sent. */
export interface PushedRow {
  id: string;
  version: number;
}

/** A push-based subscription to a query result, used by local-first "observe" reads. */
export interface Observable<T> {
  subscribe(callback: (value: T) => void): () => void;
}

/**
 * Contract shared by every entity repository. UI/usecase code depends only on
 * these interfaces (never on a concrete SQLite/Drizzle implementation), which is
 * what lets v2 swap in a synced implementation without touching callers.
 * See docs/architecture.md §3-3.
 */
export interface SyncableRepository<TEntity, TCreateInput, TUpdateInput> {
  getById(id: string): Promise<TEntity | null>;
  create(input: TCreateInput): Promise<TEntity>;
  update(id: string, patch: TUpdateInput): Promise<TEntity>;
  softDelete(id: string): Promise<void>;
  /** Rows with syncStatus === 'pending', used by the sync engine to build a push payload. */
  findPendingSync(): Promise<TEntity[]>;
  /**
   * Marks pushed rows as syncStatus === 'synced' — but only a row still at
   * the `version` that was pushed. A row written again while the push was in
   * flight (e.g. a check-in toggled back off) has moved on to a newer
   * version that the server has not seen, so it must stay 'pending';
   * marking it synced by id alone silently dropped that write.
   */
  markSynced(rows: readonly PushedRow[], syncedAt: string): Promise<void>;
  /** Upserts rows received from a pull response into the local store. */
  applyRemoteChanges(rows: readonly TEntity[]): Promise<void>;
  /**
   * Applies a pull response's `deletedIds` — server tombstones, identified by
   * id only (no full row). Marks the local row deleted with syncStatus
   * 'synced', unlike softDelete() which marks it 'pending' for a future push.
   */
  applyRemoteDeletes(ids: readonly string[]): Promise<void>;
}
