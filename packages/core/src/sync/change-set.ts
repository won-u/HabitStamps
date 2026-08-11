import { z, type ZodTypeAny } from "zod";
import { habitSchema, type Habit } from "../models/habit";
import { checkInSchema, type CheckIn } from "../models/check-in";
import { categorySchema, type Category } from "../models/category";

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
  categories: entityChangeSetSchema(categorySchema),
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
 * (server -> client) bodies. Habits, checkIns, and categories all sync —
 * Reminder is the only entity that still stays local-only in v1.
 */
export interface SyncChangeSet {
  habits: EntityChangeSet<Habit>;
  checkIns: EntityChangeSet<CheckIn>;
  categories: EntityChangeSet<Category>;
}

export function emptySyncChangeSet(): SyncChangeSet {
  return {
    habits: emptyEntityChangeSet<Habit>(),
    checkIns: emptyEntityChangeSet<CheckIn>(),
    categories: emptyEntityChangeSet<Category>(),
  };
}
