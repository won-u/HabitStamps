import { and, between, desc, eq, isNotNull, or } from "drizzle-orm";
import { randomUUID } from "expo-crypto";
import type {
  CheckIn,
  CheckInRepository,
  CreateCheckInInput,
  Observable,
  UpdateCheckInInput,
} from "@habit-tracker/core";
import { db } from "./client";
import { checkIns } from "./schema";
import { ObservableSet } from "./observable-set";

type CheckInRow = typeof checkIns.$inferSelect;

function toCheckIn({ syncStatus: _syncStatus, ...rest }: CheckInRow): CheckIn {
  return rest;
}

export class LocalCheckInRepository implements CheckInRepository {
  private readonly changes = new ObservableSet<readonly CheckIn[]>();

  async getById(id: string): Promise<CheckIn | null> {
    const [row] = await db.select().from(checkIns).where(eq(checkIns.id, id)).limit(1);
    return row ? toCheckIn(row) : null;
  }

  async getByHabitAndDate(habitId: string, date: string): Promise<CheckIn | null> {
    const [row] = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.habitId, habitId), eq(checkIns.date, date)))
      .limit(1);
    // A soft-deleted check-in for the same day should not count as "already checked in".
    if (!row || row.deletedAt) return null;
    return toCheckIn(row);
  }

  async create(input: CreateCheckInInput): Promise<CheckIn> {
    const now = new Date().toISOString();
    const row: CheckInRow = {
      id: randomUUID(),
      habitId: input.habitId,
      date: input.date,
      completedAt: input.completedAt,
      note: input.note ?? null,
      photoUri: input.photoUri ?? null,
      value: input.value ?? null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      syncStatus: "pending",
    };
    await db.insert(checkIns).values(row);
    this.changes.notify();
    return toCheckIn(row);
  }

  async update(id: string, patch: UpdateCheckInInput): Promise<CheckIn> {
    const [existing] = await db.select().from(checkIns).where(eq(checkIns.id, id)).limit(1);
    if (!existing) throw new Error(`CheckIn ${id} not found`);
    const now = new Date().toISOString();
    const updatedRow: CheckInRow = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: existing.version + 1,
      syncStatus: "pending",
    };
    await db.update(checkIns).set(updatedRow).where(eq(checkIns.id, id));
    this.changes.notify();
    return toCheckIn(updatedRow);
  }

  async softDelete(id: string): Promise<void> {
    const [existing] = await db.select().from(checkIns).where(eq(checkIns.id, id)).limit(1);
    if (!existing) return;
    const now = new Date().toISOString();
    await db
      .update(checkIns)
      .set({ deletedAt: now, updatedAt: now, version: existing.version + 1, syncStatus: "pending" })
      .where(eq(checkIns.id, id));
    this.changes.notify();
  }

  async listByHabitAndRange(habitId: string, from: string, to: string): Promise<CheckIn[]> {
    const rows = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.habitId, habitId), between(checkIns.date, from, to)));
    return rows.filter((row) => !row.deletedAt).map(toCheckIn);
  }

  async listByDate(date: string): Promise<CheckIn[]> {
    const rows = await db.select().from(checkIns).where(eq(checkIns.date, date));
    return rows.filter((row) => !row.deletedAt).map(toCheckIn);
  }

  async listAll(): Promise<CheckIn[]> {
    const rows = await db.select().from(checkIns);
    return rows.filter((row) => !row.deletedAt).map(toCheckIn);
  }

  observeByDate(date: string): Observable<readonly CheckIn[]> {
    return this.changes.observe(() => this.listByDate(date));
  }

  observeAll(): Observable<readonly CheckIn[]> {
    return this.changes.observe(() => this.listAll());
  }

  async listWithNotes(): Promise<CheckIn[]> {
    const rows = await db
      .select()
      .from(checkIns)
      .where(or(isNotNull(checkIns.note), isNotNull(checkIns.photoUri)))
      .orderBy(desc(checkIns.date));
    return rows.filter((row) => !row.deletedAt).map(toCheckIn);
  }

  observeByHabit(habitId: string): Observable<readonly CheckIn[]> {
    return this.changes.observe(async () => {
      const rows = await db.select().from(checkIns).where(eq(checkIns.habitId, habitId));
      return rows.filter((row) => !row.deletedAt).map(toCheckIn);
    });
  }

  async findPendingSync(): Promise<CheckIn[]> {
    const rows = await db.select().from(checkIns).where(eq(checkIns.syncStatus, "pending"));
    return rows.map(toCheckIn);
  }

  async markSynced(ids: readonly string[], _syncedAt: string): Promise<void> {
    for (const id of ids) {
      await db.update(checkIns).set({ syncStatus: "synced" }).where(eq(checkIns.id, id));
    }
  }

  async applyRemoteDeletes(ids: readonly string[]): Promise<void> {
    const now = new Date().toISOString();
    for (const id of ids) {
      await db.update(checkIns).set({ deletedAt: now, updatedAt: now, syncStatus: "synced" }).where(eq(checkIns.id, id));
    }
    if (ids.length > 0) this.changes.notify();
  }

  async applyRemoteChanges(rows: readonly CheckIn[]): Promise<void> {
    for (const checkIn of rows) {
      const [existing] = await db.select().from(checkIns).where(eq(checkIns.id, checkIn.id)).limit(1);
      const incomingRow: CheckInRow = { ...checkIn, syncStatus: "synced" };
      if (!existing) {
        await db.insert(checkIns).values(incomingRow);
      } else if (new Date(checkIn.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
        await db.update(checkIns).set(incomingRow).where(eq(checkIns.id, checkIn.id));
      }
    }
    this.changes.notify();
  }
}
