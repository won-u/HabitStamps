import type { FastifyPluginAsync } from "fastify";
import { gt } from "drizzle-orm";
import { syncChangeSetSchema, emptySyncChangeSet, type SyncChangeSet } from "@habit-tracker/core";
import { db } from "../db/client";
import { habits, checkIns } from "../db/schema";
import { upsertHabit, upsertCheckIn } from "../db/upsert";

/**
 * The only endpoints the mobile app actually calls in v1 — the local SQLite
 * database stays the source of truth, and these two routes just move deltas
 * in and out of it (docs/architecture.md §4-3).
 */
export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.post("/sync/push", async (req, reply) => {
    const parsed = syncChangeSetSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
    }
    const { habits: habitChanges, checkIns: checkInChanges } = parsed.data;
    const conflicts: string[] = [];

    await db.transaction(async (tx) => {
      for (const habit of [...habitChanges.created, ...habitChanges.updated]) {
        const { applied } = await upsertHabit(tx, habit);
        if (!applied) conflicts.push(habit.id);
      }
      for (const checkIn of [...checkInChanges.created, ...checkInChanges.updated]) {
        const { applied } = await upsertCheckIn(tx, checkIn);
        if (!applied) conflicts.push(checkIn.id);
      }
      // deletedIds arrive as soft-delete tombstones already reflected in `updated`
      // (the client sets deletedAt before pushing), so no separate handling needed here.
    });

    reply.send({ acceptedAt: new Date().toISOString(), conflicts });
  });

  app.get<{ Querystring: { since?: string } }>("/sync/pull", async (req, reply) => {
    const since = req.query.since ? new Date(req.query.since) : new Date(0);
    if (Number.isNaN(since.getTime())) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "invalid `since` timestamp" } });
    }

    const changedHabits = await db.select().from(habits).where(gt(habits.updatedAt, since.toISOString()));
    const changedCheckIns = await db.select().from(checkIns).where(gt(checkIns.updatedAt, since.toISOString()));

    const changes: SyncChangeSet = emptySyncChangeSet();
    for (const habit of changedHabits) {
      if (habit.deletedAt) changes.habits.deletedIds.push(habit.id);
      else changes.habits.updated.push(habit);
    }
    for (const checkIn of changedCheckIns) {
      if (checkIn.deletedAt) changes.checkIns.deletedIds.push(checkIn.id);
      else changes.checkIns.updated.push(checkIn);
    }

    reply.send({ serverTime: new Date().toISOString(), changes });
  });
};
