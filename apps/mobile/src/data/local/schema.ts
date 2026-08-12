import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
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

/** Synced as its own entity alongside habits/checkIns — see docs/architecture.md §5. */
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
    habitDateIdx: index("check_ins_habit_date_idx").on(t.habitId, t.date),
    // One active check-in per habit per day — mirrors docs/supabase-schema.sql.
    // toggle()'s in-memory lock already prevents this on a single device, but
    // this is the backstop for paths that don't go through it: two devices
    // independently creating a check-in for the same day while offline, then
    // both syncing (see check-in-repository.ts's applyRemoteChanges).
    habitDateUniqueIdx: uniqueIndex("check_ins_habit_date_unique_idx")
      .on(t.habitId, t.date)
      .where(sql`${t.deletedAt} is null`),
    updatedAtIdx: index("check_ins_updated_at_idx").on(t.updatedAt),
  }),
);
