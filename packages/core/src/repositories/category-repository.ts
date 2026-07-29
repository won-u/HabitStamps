import type { Category, CreateCategoryInput, UpdateCategoryInput } from "../models/category";
import type { Observable, SyncableRepository } from "./common";

export interface CategoryRepository
  extends SyncableRepository<Category, CreateCategoryInput, UpdateCategoryInput> {
  list(): Promise<Category[]>;
  observe(): Observable<readonly Category[]>;
}
