import { asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "expo-crypto";
import type {
  CreateHabitInput,
  Habit,
  HabitRepository,
  Observable,
  UpdateHabitInput,
} from "@habit-tracker/core";
import { db } from "./client";
import { habits } from "./schema";
import { ObservableSet } from "./observable-set";

type HabitRow = typeof habits.$inferSelect;

function toHabit({ syncStatus: _syncStatus, ...rest }: HabitRow): Habit {
  return rest;
}

export class LocalHabitRepository implements HabitRepository {
  private readonly changes = new ObservableSet<readonly Habit[]>();

  async getById(id: string): Promise<Habit | null> {
    const [row] = await db.select().from(habits).where(eq(habits.id, id)).limit(1);
    return row ? toHabit(row) : null;
  }

  async create(input: CreateHabitInput): Promise<Habit> {
    const now = new Date().toISOString();
    const row: HabitRow = {
      id: randomUUID(),
      name: input.name,
      icon: input.icon,
      color: input.color,
      categoryId: input.categoryId ?? null,
      frequencyType: input.frequencyType,
      frequencyConfig: input.frequencyConfig,
      isArchived: input.isArchived ?? false,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      syncStatus: "pending",
    };
    await db.insert(habits).values(row);
    this.changes.notify();
    return toHabit(row);
  }

  async update(id: string, patch: UpdateHabitInput): Promise<Habit> {
    const [existing] = await db.select().from(habits).where(eq(habits.id, id)).limit(1);
    if (!existing) throw new Error(`Habit ${id} not found`);
    const now = new Date().toISOString();
    const updatedRow: HabitRow = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: existing.version + 1,
      syncStatus: "pending",
    };
    await db.update(habits).set(updatedRow).where(eq(habits.id, id));
    this.changes.notify();
    return toHabit(updatedRow);
  }

  async softDelete(id: string): Promise<void> {
    const [existing] = await db.select().from(habits).where(eq(habits.id, id)).limit(1);
    if (!existing) return;
    const now = new Date().toISOString();
    await db
      .update(habits)
      .set({ deletedAt: now, updatedAt: now, version: existing.version + 1, syncStatus: "pending" })
      .where(eq(habits.id, id));
    this.changes.notify();
  }

  async list(filter?: { includeArchived?: boolean }): Promise<Habit[]> {
    const rows = await db.select().from(habits).where(isNull(habits.deletedAt)).orderBy(asc(habits.sortOrder));
    return rows.filter((row) => filter?.includeArchived || !row.isArchived).map(toHabit);
  }

  observe(filter?: { includeArchived?: boolean }): Observable<readonly Habit[]> {
    return this.changes.observe(() => this.list(filter));
  }

  async findPendingSync(): Promise<Habit[]> {
    const rows = await db.select().from(habits).where(eq(habits.syncStatus, "pending"));
    return rows.map(toHabit);
  }

  async markSynced(ids: readonly string[], _syncedAt: string): Promise<void> {
    for (const id of ids) {
      await db.update(habits).set({ syncStatus: "synced" }).where(eq(habits.id, id));
    }
  }

  async applyRemoteDeletes(ids: readonly string[]): Promise<void> {
    const now = new Date().toISOString();
    for (const id of ids) {
      await db.update(habits).set({ deletedAt: now, updatedAt: now, syncStatus: "synced" }).where(eq(habits.id, id));
    }
    if (ids.length > 0) this.changes.notify();
  }

  async applyRemoteChanges(rows: readonly Habit[]): Promise<void> {
    for (const habit of rows) {
      const [existing] = await db.select().from(habits).where(eq(habits.id, habit.id)).limit(1);
      const incomingRow: HabitRow = { ...habit, syncStatus: "synced" };
      if (!existing) {
        await db.insert(habits).values(incomingRow);
      } else if (new Date(habit.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
        await db.update(habits).set(incomingRow).where(eq(habits.id, habit.id));
      }
    }
    this.changes.notify();
  }
}
