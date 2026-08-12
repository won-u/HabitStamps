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
 * bucket for items that have no category — or whose categoryId points at a
 * category this device doesn't have (e.g. synced from another device before
 * that category itself was pulled down; categories are their own sync
 * entity, so a habit's categoryId can arrive before the category row does).
 * Falling back instead of dropping the item keeps it visible. Shared by the
 * Stats screen's Weekly/Monthly/Yearly report sections — the Today screen
 * keeps its own inline copy of this same matching logic.
 */
export function groupByCategory<T>(
  items: readonly T[],
  categories: readonly Category[],
  getCategoryId: (item: T) => string | null,
): CategoryGroup<T>[] {
  const knownCategoryIds = new Set(categories.map((category) => category.id));
  const byCategory = new Map<string, T[]>();
  for (const item of items) {
    const categoryId = getCategoryId(item);
    const key = categoryId && knownCategoryIds.has(categoryId) ? categoryId : DEFAULT_GROUP_KEY;
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
