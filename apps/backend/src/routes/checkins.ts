import type { FastifyPluginAsync } from "fastify";
import { and, between, eq, isNull } from "drizzle-orm";
import { checkInSchema, updateCheckInInputSchema } from "@habit-tracker/core";
import { db } from "../db/client";
import { checkIns } from "../db/schema";
import { upsertCheckIn } from "../db/upsert";

export const checkInRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { habitId?: string; from?: string; to?: string } }>("/checkins", async (req) => {
    const { habitId, from, to } = req.query;
    const conditions = [isNull(checkIns.deletedAt)];
    if (habitId) conditions.push(eq(checkIns.habitId, habitId));
    if (from && to) conditions.push(between(checkIns.date, from, to));
    return db.select().from(checkIns).where(and(...conditions));
  });

  app.post("/checkins", async (req, reply) => {
    const parsed = checkInSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
    }
    await upsertCheckIn(db, parsed.data);
    reply.code(201).send(parsed.data);
  });

  app.patch<{ Params: { id: string } }>("/checkins/:id", async (req, reply) => {
    const parsed = updateCheckInInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
    }
    const [existing] = await db.select().from(checkIns).where(eq(checkIns.id, req.params.id)).limit(1);
    if (!existing) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "check-in not found" } });
    }
    const now = new Date().toISOString();
    const [updated] = await db
      .update(checkIns)
      .set({ ...parsed.data, updatedAt: now, version: existing.version + 1 })
      .where(eq(checkIns.id, req.params.id))
      .returning();
    reply.send(updated);
  });

  app.delete<{ Params: { id: string } }>("/checkins/:id", async (req, reply) => {
    const [existing] = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.id, req.params.id), isNull(checkIns.deletedAt)))
      .limit(1);
    if (!existing) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "check-in not found" } });
    }
    const now = new Date().toISOString();
    await db
      .update(checkIns)
      .set({ deletedAt: now, updatedAt: now, version: existing.version + 1 })
      .where(eq(checkIns.id, req.params.id));
    reply.code(204).send();
  });
};
