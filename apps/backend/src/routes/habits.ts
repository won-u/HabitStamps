import type { FastifyPluginAsync } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { habitSchema, updateHabitInputSchema } from "@habit-tracker/core";
import { db } from "../db/client";
import { habits } from "../db/schema";
import { upsertHabit } from "../db/upsert";

/**
 * Plain CRUD, mainly for manual verification (curl, docs/architecture.md §4-5)
 * and a future web admin — the mobile app itself only talks to /sync/push and
 * /sync/pull (see routes/sync.ts).
 */
export const habitRoutes: FastifyPluginAsync = async (app) => {
  app.get("/habits", async () => {
    return db.select().from(habits).where(isNull(habits.deletedAt));
  });

  app.post("/habits", async (req, reply) => {
    const parsed = habitSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
    }
    await upsertHabit(db, parsed.data);
    reply.code(201).send(parsed.data);
  });

  app.patch<{ Params: { id: string } }>("/habits/:id", async (req, reply) => {
    const parsed = updateHabitInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
    }
    const [existing] = await db.select().from(habits).where(eq(habits.id, req.params.id)).limit(1);
    if (!existing) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "habit not found" } });
    }
    const now = new Date().toISOString();
    const [updated] = await db
      .update(habits)
      .set({ ...parsed.data, updatedAt: now, version: existing.version + 1 })
      .where(eq(habits.id, req.params.id))
      .returning();
    reply.send(updated);
  });

  app.delete<{ Params: { id: string } }>("/habits/:id", async (req, reply) => {
    const [existing] = await db.select().from(habits).where(and(eq(habits.id, req.params.id), isNull(habits.deletedAt))).limit(1);
    if (!existing) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "habit not found" } });
    }
    const now = new Date().toISOString();
    await db
      .update(habits)
      .set({ deletedAt: now, updatedAt: now, version: existing.version + 1 })
      .where(eq(habits.id, req.params.id));
    reply.code(204).send();
  });
};
