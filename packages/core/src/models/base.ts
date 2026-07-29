import { z } from "zod";

/**
 * Fields every syncable entity (Habit, CheckIn, Category, Reminder) carries
 * from v1 onward, even though v1 has no server. This is what lets v2 add
 * sync as a purely additive change (see docs/architecture.md §3-1):
 * - id is client-generated so offline creation never blocks on a server.
 * - updatedAt/version back the push/pull LWW conflict resolution.
 * - deletedAt is a soft-delete tombstone so deletions can propagate.
 * - syncStatus is local-only bookkeeping, never sent to the server.
 */
export const syncStatusSchema = z.enum(["synced", "pending", "conflict"]);
export type SyncStatus = z.infer<typeof syncStatusSchema>;

// Plain z.string() rather than z.string().datetime(): a row round-tripped
// through Postgres (mode: "string" timestamp columns) comes back as
// "2026-07-29 02:32:39.35+00" — valid and correctly parsed by `new Date(...)`,
// but not strict ISO 8601, so zod's .datetime() rejects it on the next push.
export const baseSyncFieldsSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().min(1),
  deletedAt: z.string().nullable(),
});
export type BaseSyncFields = z.infer<typeof baseSyncFieldsSchema>;

/** Local-only field appended to persisted rows, stripped before anything is sent to the server. */
export const localSyncFieldsSchema = z.object({
  syncStatus: syncStatusSchema,
});
export type LocalSyncFields = z.infer<typeof localSyncFieldsSchema>;
