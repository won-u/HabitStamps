import type { CategoryRepository, CheckInRepository, HabitRepository, SyncChangeSet, SyncGateway } from "@habit-tracker/core";

export interface SyncSummary {
  pushedHabits: number;
  pushedCheckIns: number;
  pushedCategories: number;
  pulledHabits: number;
  pulledCheckIns: number;
  pulledCategories: number;
  conflicts: string[];
  serverTime: string;
}

/**
 * Orchestrates one push-then-pull round trip. The local repositories stay the
 * source of truth throughout — this only moves deltas in and out of them
 * (docs/architecture.md §3-3, §4-3).
 */
export class SyncEngine {
  constructor(
    private readonly habitRepository: HabitRepository,
    private readonly checkInRepository: CheckInRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly gateway: SyncGateway,
  ) {}

  async syncNow(sinceIso: string): Promise<SyncSummary> {
    const pendingHabits = await this.habitRepository.findPendingSync();
    const pendingCheckIns = await this.checkInRepository.findPendingSync();
    const pendingCategories = await this.categoryRepository.findPendingSync();

    const changes: SyncChangeSet = {
      habits: { created: [], updated: pendingHabits, deletedIds: [] },
      checkIns: { created: [], updated: pendingCheckIns, deletedIds: [] },
      categories: { created: [], updated: pendingCategories, deletedIds: [] },
    };

    const pushResult = await this.gateway.push(changes);
    const conflictIds = new Set(pushResult.conflicts);

    const pushedHabitIds = pendingHabits.map((h) => h.id).filter((id) => !conflictIds.has(id));
    const pushedCheckInIds = pendingCheckIns.map((c) => c.id).filter((id) => !conflictIds.has(id));
    const pushedCategoryIds = pendingCategories.map((c) => c.id).filter((id) => !conflictIds.has(id));
    await this.habitRepository.markSynced(pushedHabitIds, pushResult.acceptedAt);
    await this.checkInRepository.markSynced(pushedCheckInIds, pushResult.acceptedAt);
    await this.categoryRepository.markSynced(pushedCategoryIds, pushResult.acceptedAt);

    const pullResult = await this.gateway.pull(sinceIso);
    const { habits, checkIns, categories } = pullResult.changes;

    // Categories first: applyRemoteDeletes/applyRemoteChanges for habits run
    // independently of category rows, but pulling categories before habits
    // means a habit that references a category new to this device finds it
    // already present the moment the Today screen's grouping re-renders.
    await this.categoryRepository.applyRemoteChanges([...categories.created, ...categories.updated]);
    await this.categoryRepository.applyRemoteDeletes(categories.deletedIds);
    await this.habitRepository.applyRemoteChanges([...habits.created, ...habits.updated]);
    await this.checkInRepository.applyRemoteChanges([...checkIns.created, ...checkIns.updated]);
    await this.habitRepository.applyRemoteDeletes(habits.deletedIds);
    await this.checkInRepository.applyRemoteDeletes(checkIns.deletedIds);

    return {
      pushedHabits: pushedHabitIds.length,
      pushedCheckIns: pushedCheckInIds.length,
      pushedCategories: pushedCategoryIds.length,
      pulledHabits: habits.created.length + habits.updated.length,
      pulledCheckIns: checkIns.created.length + checkIns.updated.length,
      pulledCategories: categories.created.length + categories.updated.length,
      conflicts: pushResult.conflicts,
      serverTime: pullResult.serverTime,
    };
  }
}
