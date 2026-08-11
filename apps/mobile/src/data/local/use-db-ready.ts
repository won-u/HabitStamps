import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { db } from "./client";
// eslint-disable-next-line import/no-relative-parent-imports -- drizzle-kit generates this file at the project root, outside src/
import migrations from "../../../drizzle/migrations";

/** Native (iOS/Android): applies pending expo-sqlite/Drizzle migrations. See use-db-ready.web.ts for the IndexedDB counterpart. */
export function useDbReady(): { ready: boolean; error: string | null } {
  const { success, error } = useMigrations(db, migrations);
  return { ready: Boolean(success), error: error ? error.message : null };
}
