import { asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "expo-crypto";
import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  Observable,
  UpdateCategoryInput,
} from "@habit-tracker/core";
import { db } from "./client";
import { categories } from "./schema";
import { ObservableSet } from "./observable-set";

type CategoryRow = typeof categories.$inferSelect;

function toCategory({ syncStatus: _syncStatus, ...rest }: CategoryRow): Category {
  return rest;
}

export class LocalCategoryRepository implements CategoryRepository {
  private readonly changes = new ObservableSet<readonly Category[]>();

  async getById(id: string): Promise<Category | null> {
    const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return row ? toCategory(row) : null;
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const now = new Date().toISOString();
    const row: CategoryRow = {
      id: randomUUID(),
      name: input.name,
      color: input.color,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      syncStatus: "pending",
    };
    await db.insert(categories).values(row);
    this.changes.notify();
    return toCategory(row);
  }

  async update(id: string, patch: UpdateCategoryInput): Promise<Category> {
    const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!existing) throw new Error(`Category ${id} not found`);
    const now = new Date().toISOString();
    const updatedRow: CategoryRow = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: existing.version + 1,
      syncStatus: "pending",
    };
    await db.update(categories).set(updatedRow).where(eq(categories.id, id));
    this.changes.notify();
    return toCategory(updatedRow);
  }

  async softDelete(id: string): Promise<void> {
    const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!existing) return;
    const now = new Date().toISOString();
    await db
      .update(categories)
      .set({ deletedAt: now, updatedAt: now, version: existing.version + 1, syncStatus: "pending" })
      .where(eq(categories.id, id));
    this.changes.notify();
  }

  async list(): Promise<Category[]> {
    const rows = await db.select().from(categories).where(isNull(categories.deletedAt)).orderBy(asc(categories.sortOrder));
    return rows.map(toCategory);
  }

  observe(): Observable<readonly Category[]> {
    return this.changes.observe(() => this.list());
  }

  async findPendingSync(): Promise<Category[]> {
    const rows = await db.select().from(categories).where(eq(categories.syncStatus, "pending"));
    return rows.map(toCategory);
  }

  async markSynced(ids: readonly string[], _syncedAt: string): Promise<void> {
    for (const id of ids) {
      await db.update(categories).set({ syncStatus: "synced" }).where(eq(categories.id, id));
    }
  }

  async applyRemoteDeletes(ids: readonly string[]): Promise<void> {
    const now = new Date().toISOString();
    for (const id of ids) {
      await db.update(categories).set({ deletedAt: now, updatedAt: now, syncStatus: "synced" }).where(eq(categories.id, id));
    }
    if (ids.length > 0) this.changes.notify();
  }

  async applyRemoteChanges(rows: readonly Category[]): Promise<void> {
    for (const category of rows) {
      const [existing] = await db.select().from(categories).where(eq(categories.id, category.id)).limit(1);
      const incomingRow: CategoryRow = { ...category, syncStatus: "synced" };
      if (!existing) {
        await db.insert(categories).values(incomingRow);
      } else if (new Date(category.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
        await db.update(categories).set(incomingRow).where(eq(categories.id, category.id));
      }
    }
    this.changes.notify();
  }
}
