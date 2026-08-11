import type { Category } from '@habit-tracker/core';

const DEFAULT_GROUP_KEY = '__default__';
const DEFAULT_GROUP_NAME = '기본';

export interface CategoryGroup<T> {
  key: string;
  name: string;
  items: T[];
}

/**
 * Buckets items by categoryId, in category-list order, with a leading '기본'
 * bucket for items that have no category. Shared by the Stats screen's
 * Weekly/Monthly/Yearly report sections — the Today screen keeps its own
 * inline copy of this same pattern for now (out of scope for this change).
 */
export function groupByCategory<T>(
  items: readonly T[],
  categories: readonly Category[],
  getCategoryId: (item: T) => string | null,
): CategoryGroup<T>[] {
  const byCategory = new Map<string, T[]>();
  for (const item of items) {
    const key = getCategoryId(item) ?? DEFAULT_GROUP_KEY;
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(item);
    else byCategory.set(key, [item]);
  }

  const result: CategoryGroup<T>[] = [];
  const defaultItems = byCategory.get(DEFAULT_GROUP_KEY);
  if (defaultItems) result.push({ key: DEFAULT_GROUP_KEY, name: DEFAULT_GROUP_NAME, items: defaultItems });
  for (const category of categories) {
    const bucket = byCategory.get(category.id);
    if (bucket) result.push({ key: category.id, name: category.name, items: bucket });
  }
  return result;
}
