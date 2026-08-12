import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Category, CheckIn, Habit, SyncStatus } from "@habit-tracker/core";

/**
 * Web-only local persistence — see docs/architecture.md §3-4. Native builds
 * use expo-sqlite (see client.ts/schema.ts); the web build has no SQLite, so
 * this mirrors the same three tables as IndexedDB object stores instead.
 * Same repository interfaces, same LWW/syncStatus fields, different storage
 * engine underneath — the sync engine and every screen are unaware which one
 * is active.
 */
export interface LocalHabitRow extends Habit {
  syncStatus: SyncStatus;
}
export interface LocalCheckInRow extends CheckIn {
  syncStatus: SyncStatus;
}
export interface LocalCategoryRow extends Category {
  syncStatus: SyncStatus;
}

interface HabitTrackerDB extends DBSchema {
  habits: {
    key: string;
    value: LocalHabitRow;
    indexes: { syncStatus: SyncStatus };
  };
  check_ins: {
    key: string;
    value: LocalCheckInRow;
    indexes: { habitId: string; date: string; syncStatus: SyncStatus };
  };
  categories: {
    key: string;
    value: LocalCategoryRow;
    indexes: { syncStatus: SyncStatus };
  };
}

let dbPromise: Promise<IDBPDatabase<HabitTrackerDB>> | null = null;

export function getWebDb(): Promise<IDBPDatabase<HabitTrackerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<HabitTrackerDB>("habit-tracker", 1, {
      upgrade(db) {
        const habits = db.createObjectStore("habits", { keyPath: "id" });
        habits.createIndex("syncStatus", "syncStatus");

        const checkIns = db.createObjectStore("check_ins", { keyPath: "id" });
        checkIns.createIndex("habitId", "habitId");
        checkIns.createIndex("date", "date");
        checkIns.createIndex("syncStatus", "syncStatus");

        const categories = db.createObjectStore("categories", { keyPath: "id" });
        categories.createIndex("syncStatus", "syncStatus");
      },
    });
  }
  return dbPromise;
}
