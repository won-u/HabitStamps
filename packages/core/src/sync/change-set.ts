import { z, type ZodTypeAny } from "zod";
import { habitSchema, type Habit } from "../models/habit";
import { checkInSchema, type CheckIn } from "../models/check-in";

export function entityChangeSetSchema<TSchema extends ZodTypeAny>(entitySchema: TSchema) {
  return z.object({
    created: z.array(entitySchema),
    updated: z.array(entitySchema),
    deletedIds: z.array(z.string().uuid()),
  });
}

/** Validates a POST /sync/push request body, shared by client and server. */
export const syncChangeSetSchema = z.object({
  habits: entityChangeSetSchema(habitSchema),
  checkIns: entityChangeSetSchema(checkInSchema),
});

export interface EntityChangeSet<T> {
  created: T[];
  updated: T[];
  /** ids whose deletedAt is now set (soft-delete tombstones), not physically removed */
  deletedIds: string[];
}

export function emptyEntityChangeSet<T>(): EntityChangeSet<T> {
  return { created: [], updated: [], deletedIds: [] };
}

/**
 * The wire format for both /sync/push (client -> server) and /sync/pull
 * (server -> client) bodies. Scope matches docs/architecture.md §4-2:
 * habits and checkIns only — categories/reminders stay local-only in v1.
 */
export interface SyncChangeSet {
  habits: EntityChangeSet<Habit>;
  checkIns: EntityChangeSet<CheckIn>;
}

export function emptySyncChangeSet(): SyncChangeSet {
  return {
    habits: emptyEntityChangeSet<Habit>(),
    checkIns: emptyEntityChangeSet<CheckIn>(),
  };
}
