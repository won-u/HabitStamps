import type { Observable } from "@habit-tracker/core";

/**
 * Backs each repository's `observe()`. All writes go through the same
 * repository singleton (wired once in composition/container.ts), so a plain
 * in-process notify-on-write is enough — no need for expo-sqlite's native
 * change-listener plumbing.
 */
export class ObservableSet<T> {
  private readonly listeners = new Set<() => void>();

  observe(getSnapshot: () => Promise<T>): Observable<T> {
    return {
      subscribe: (callback) => {
        const refresh = () => {
          getSnapshot().then(callback);
        };
        refresh();
        this.listeners.add(refresh);
        return () => this.listeners.delete(refresh);
      },
    };
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }
}
