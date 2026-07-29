import { pgTable, text, integer, boolean, timestamp, uuid, jsonb, doublePrecision, index } from "drizzle-orm/pg-core";
import type { FrequencyConfig, FrequencyType } from "@habit-tracker/core";

/**
 * Mirrors packages/core's Habit/CheckIn shape field-for-field (see docs/architecture.md §3-2).
 * syncStatus is intentionally absent here — it is local-only bookkeeping on the
 * mobile app and is never sent to or stored on the server.
 */
export const habits = pgTable(
  "habits",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    categoryId: uuid("category_id"),
    frequencyType: text("frequency_type").$type<FrequencyType>().notNull(),
    frequencyConfig: jsonb("frequency_config").$type<FrequencyConfig>().notNull(),
    isArchived: boolean("is_archived").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (t) => ({
    updatedAtIdx: index("habits_updated_at_idx").on(t.updatedAt),
  }),
);

export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id),
    date: text("date").notNull(), // 'YYYY-MM-DD'
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }).notNull(),
    note: text("note"),
    photoUri: text("photo_uri"),
    value: doublePrecision("value"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (t) => ({
    // Not a UNIQUE constraint: a plain unique(habit_id, date) would reject
    // re-checking a day after a prior soft-deleted row for the same date.
    // "One check-in per habit per day" is enforced by the mobile app instead.
    habitDateIdx: index("check_ins_habit_date_idx").on(t.habitId, t.date),
    updatedAtIdx: index("check_ins_updated_at_idx").on(t.updatedAt),
  }),
);
