import { useEffect, useState } from "react";
import { getWebDb } from "./web-db";

/** Web: opens (and, on first run, creates) the IndexedDB database. See use-db-ready.ts for the native/SQLite counterpart. */
export function useDbReady(): { ready: boolean; error: string | null } {
  const [state, setState] = useState<{ ready: boolean; error: string | null }>({ ready: false, error: null });

  useEffect(() => {
    let cancelled = false;
    getWebDb()
      .then(() => {
        if (!cancelled) setState({ ready: true, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ ready: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
