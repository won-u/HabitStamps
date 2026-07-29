import { eq } from "drizzle-orm";
import type { Habit, CheckIn } from "@habit-tracker/core";
import { habits, checkIns } from "./schema";

/** Accepts either the top-level `db` or a `db.transaction(tx => ...)` callback's `tx` — both expose the same query builder. */
type Queryable = { select: any; insert: any; update: any };

/**
 * Shared last-write-wins upsert used by both the plain CRUD routes and
 * /sync/push, so the two never drift apart (docs/architecture.md §4-3).
 * Returns applied=false when the existing server row is newer than the
 * incoming one — callers collect those ids into the push response's
 * `conflicts` array so the client picks up the server's version on its next pull.
 */
export async function upsertHabit(db: Queryable, incoming: Habit): Promise<{ applied: boolean }> {
  const [existing] = await db.select().from(habits).where(eq(habits.id, incoming.id)).limit(1);

  if (!existing) {
    await db.insert(habits).values(incoming);
    return { applied: true };
  }

  if (new Date(incoming.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
    await db.update(habits).set(incoming).where(eq(habits.id, incoming.id));
    return { applied: true };
  }

  return { applied: false };
}

export async function upsertCheckIn(db: Queryable, incoming: CheckIn): Promise<{ applied: boolean }> {
  const [existing] = await db.select().from(checkIns).where(eq(checkIns.id, incoming.id)).limit(1);

  if (!existing) {
    await db.insert(checkIns).values(incoming);
    return { applied: true };
  }

  if (new Date(incoming.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
    await db.update(checkIns).set(incoming).where(eq(checkIns.id, incoming.id));
    return { applied: true };
  }

  return { applied: false };
}
