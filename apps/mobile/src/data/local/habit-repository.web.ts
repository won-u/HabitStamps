import type {
  CreateHabitInput,
  Habit,
  HabitRepository,
  Observable,
  UpdateHabitInput,
} from "@habit-tracker/core";
import { getWebDb, type LocalHabitRow } from "./web-db";
import { ObservableSet } from "./observable-set";

function toHabit({ syncStatus: _syncStatus, ...rest }: LocalHabitRow): Habit {
  return rest;
}

export class LocalHabitRepository implements HabitRepository {
  private readonly changes = new ObservableSet<readonly Habit[]>();

  async getById(id: string): Promise<Habit | null> {
    const db = await getWebDb();
    const row = await db.get("habits", id);
    return row ? toHabit(row) : null;
  }

  async create(input: CreateHabitInput): Promise<Habit> {
    const db = await getWebDb();
    const now = new Date().toISOString();
    const row: LocalHabitRow = {
      id: crypto.randomUUID(),
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
    await db.put("habits", row);
    this.changes.notify();
    return toHabit(row);
  }

  async update(id: string, patch: UpdateHabitInput): Promise<Habit> {
    const db = await getWebDb();
    const existing = await db.get("habits", id);
    if (!existing) throw new Error(`Habit ${id} not found`);
    const now = new Date().toISOString();
    const updatedRow: LocalHabitRow = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: existing.version + 1,
      syncStatus: "pending",
    };
    await db.put("habits", updatedRow);
    this.changes.notify();
    return toHabit(updatedRow);
  }

  async softDelete(id: string): Promise<void> {
    const db = await getWebDb();
    const existing = await db.get("habits", id);
    if (!existing) return;
    const now = new Date().toISOString();
    await db.put("habits", {
      ...existing,
      deletedAt: now,
      updatedAt: now,
      version: existing.version + 1,
      syncStatus: "pending",
    });
    this.changes.notify();
  }

  async list(filter?: { includeArchived?: boolean }): Promise<Habit[]> {
    const db = await getWebDb();
    const rows = await db.getAll("habits");
    return rows
      .filter((row) => !row.deletedAt)
      .filter((row) => filter?.includeArchived || !row.isArchived)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toHabit);
  }

  observe(filter?: { includeArchived?: boolean }): Observable<readonly Habit[]> {
    return this.changes.observe(() => this.list(filter));
  }

  async findPendingSync(): Promise<Habit[]> {
    const db = await getWebDb();
    const rows = await db.getAllFromIndex("habits", "syncStatus", "pending");
    return rows.map(toHabit);
  }

  async markSynced(ids: readonly string[], _syncedAt: string): Promise<void> {
    const db = await getWebDb();
    for (const id of ids) {
      const existing = await db.get("habits", id);
      if (existing) await db.put("habits", { ...existing, syncStatus: "synced" });
    }
  }

  async applyRemoteDeletes(ids: readonly string[]): Promise<void> {
    const db = await getWebDb();
    const now = new Date().toISOString();
    for (const id of ids) {
      const existing = await db.get("habits", id);
      if (existing) await db.put("habits", { ...existing, deletedAt: now, updatedAt: now, syncStatus: "synced" });
    }
    if (ids.length > 0) this.changes.notify();
  }

  async applyRemoteChanges(rows: readonly Habit[]): Promise<void> {
    const db = await getWebDb();
    for (const habit of rows) {
      const existing = await db.get("habits", habit.id);
      const incomingRow: LocalHabitRow = { ...habit, syncStatus: "synced" };
      if (!existing || new Date(habit.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
        await db.put("habits", incomingRow);
      }
    }
    this.changes.notify();
  }
}
