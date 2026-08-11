import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import type { FrequencyConfig, FrequencyType, SyncStatus } from "@habit-tracker/core";

/**
 * Mirrors docs/supabase-schema.sql field-for-field, plus one local-only
 * column (sync_status) that is never sent to the server. See
 * docs/architecture.md §3.
 */
export const habits = sqliteTable(
  "habits",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    categoryId: text("category_id"),
    frequencyType: text("frequency_type").$type<FrequencyType>().notNull(),
    frequencyConfig: text("frequency_config", { mode: "json" }).$type<FrequencyConfig>().notNull(),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
    deletedAt: text("deleted_at"),
    syncStatus: text("sync_status").$type<SyncStatus>().notNull().default("pending"),
  },
  (t) => ({
    updatedAtIdx: index("habits_updated_at_idx").on(t.updatedAt),
  }),
);

/** Local-only (not part of the v1 sync scope — see docs/architecture.md §4-2). */
export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
    deletedAt: text("deleted_at"),
    syncStatus: text("sync_status").$type<SyncStatus>().notNull().default("pending"),
  },
  (t) => ({
    updatedAtIdx: index("categories_updated_at_idx").on(t.updatedAt),
  }),
);

export const checkIns = sqliteTable(
  "check_ins",
  {
    id: text("id").primaryKey(),
    habitId: text("habit_id")
      .notNull()
      .references(() => habits.id),
    date: text("date").notNull(), // 'YYYY-MM-DD'
    completedAt: text("completed_at").notNull(),
    note: text("note"),
    photoUri: text("photo_uri"),
    value: real("value"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
    deletedAt: text("deleted_at"),
    syncStatus: text("sync_status").$type<SyncStatus>().notNull().default("pending"),
  },
  (t) => ({
    // See docs/supabase-schema.sql for why this is a plain index, not UNIQUE.
    habitDateIdx: index("check_ins_habit_date_idx").on(t.habitId, t.date),
    updatedAtIdx: index("check_ins_updated_at_idx").on(t.updatedAt),
  }),
);
