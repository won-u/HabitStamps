import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  Observable,
  UpdateCategoryInput,
} from "@habit-tracker/core";
import { getWebDb, type LocalCategoryRow } from "./web-db";
import { ObservableSet } from "./observable-set";

function toCategory({ syncStatus: _syncStatus, ...rest }: LocalCategoryRow): Category {
  return rest;
}

export class LocalCategoryRepository implements CategoryRepository {
  private readonly changes = new ObservableSet<readonly Category[]>();

  async getById(id: string): Promise<Category | null> {
    const db = await getWebDb();
    const row = await db.get("categories", id);
    return row ? toCategory(row) : null;
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const db = await getWebDb();
    const now = new Date().toISOString();
    const row: LocalCategoryRow = {
      id: crypto.randomUUID(),
      name: input.name,
      color: input.color,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      syncStatus: "pending",
    };
    await db.put("categories", row);
    this.changes.notify();
    return toCategory(row);
  }

  async update(id: string, patch: UpdateCategoryInput): Promise<Category> {
    const db = await getWebDb();
    const existing = await db.get("categories", id);
    if (!existing) throw new Error(`Category ${id} not found`);
    const now = new Date().toISOString();
    const updatedRow: LocalCategoryRow = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: existing.version + 1,
      syncStatus: "pending",
    };
    await db.put("categories", updatedRow);
    this.changes.notify();
    return toCategory(updatedRow);
  }

  async softDelete(id: string): Promise<void> {
    const db = await getWebDb();
    const existing = await db.get("categories", id);
    if (!existing) return;
    const now = new Date().toISOString();
    await db.put("categories", {
      ...existing,
      deletedAt: now,
      updatedAt: now,
      version: existing.version + 1,
      syncStatus: "pending",
    });
    this.changes.notify();
  }

  async list(): Promise<Category[]> {
    const db = await getWebDb();
    const rows = await db.getAll("categories");
    return rows
      .filter((row) => !row.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toCategory);
  }

  observe(): Observable<readonly Category[]> {
    return this.changes.observe(() => this.list());
  }

  async findPendingSync(): Promise<Category[]> {
    const db = await getWebDb();
    const rows = await db.getAllFromIndex("categories", "syncStatus", "pending");
    return rows.map(toCategory);
  }

  async markSynced(ids: readonly string[], _syncedAt: string): Promise<void> {
    const db = await getWebDb();
    for (const id of ids) {
      const existing = await db.get("categories", id);
      if (existing) await db.put("categories", { ...existing, syncStatus: "synced" });
    }
  }

  async applyRemoteDeletes(ids: readonly string[]): Promise<void> {
    const db = await getWebDb();
    const now = new Date().toISOString();
    for (const id of ids) {
      const existing = await db.get("categories", id);
      if (existing) await db.put("categories", { ...existing, deletedAt: now, updatedAt: now, syncStatus: "synced" });
    }
    if (ids.length > 0) this.changes.notify();
  }

  async applyRemoteChanges(rows: readonly Category[]): Promise<void> {
    const db = await getWebDb();
    for (const category of rows) {
      const existing = await db.get("categories", category.id);
      const incomingRow: LocalCategoryRow = { ...category, syncStatus: "synced" };
      if (!existing || new Date(category.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
        await db.put("categories", incomingRow);
      }
    }
    this.changes.notify();
  }
}
