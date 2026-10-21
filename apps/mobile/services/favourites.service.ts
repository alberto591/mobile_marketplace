import type { ICartStorage } from './cart-storage';
import { AsyncStorageCartStorage } from './cart-storage';

export const FAVOURITES_STORAGE_KEY = '@buscapiezas:favourites_v1';

export function deserializeFavouriteIds(raw: string | null): readonly string[] {
  if (!raw) return Object.freeze([]);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return Object.freeze([]);
    const deduplicated = Array.from(
      new Set(
        parsed
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim())
      )
    );
    return Object.freeze(deduplicated);
  } catch {
    return Object.freeze([]);
  }
}

export function serializeFavouriteIds(ids: readonly string[]): string {
  return JSON.stringify(Array.from(new Set(ids)));
}

export function addFavouriteId(currentIds: readonly string[], newId: string): readonly string[] {
  const cleanId = newId.trim();
  if (!cleanId || currentIds.includes(cleanId)) {
    return currentIds;
  }
  return Object.freeze([cleanId, ...currentIds]);
}

export function removeFavouriteId(currentIds: readonly string[], targetId: string): readonly string[] {
  const cleanId = targetId.trim();
  if (!currentIds.includes(cleanId)) {
    return currentIds;
  }
  return Object.freeze(currentIds.filter((id) => id !== cleanId));
}

export function toggleFavouriteId(
  currentIds: readonly string[],
  id: string
): { readonly updated: readonly string[]; readonly isAdded: boolean } {
  const cleanId = id.trim();
  if (currentIds.includes(cleanId)) {
    return {
      updated: removeFavouriteId(currentIds, cleanId),
      isAdded: false,
    };
  }
  return {
    updated: addFavouriteId(currentIds, cleanId),
    isAdded: true,
  };
}

export class FavouritesStorageService {
  constructor(private readonly storage: ICartStorage = new AsyncStorageCartStorage()) {}

  async loadFavourites(): Promise<readonly string[]> {
    try {
      const raw = await this.storage.getItem(FAVOURITES_STORAGE_KEY);
      return deserializeFavouriteIds(raw);
    } catch {
      return Object.freeze([]);
    }
  }

  async saveFavourites(ids: readonly string[]): Promise<void> {
    try {
      const serialized = serializeFavouriteIds(ids);
      await this.storage.setItem(FAVOURITES_STORAGE_KEY, serialized);
    } catch {
      // Storage errors fail gracefully without crashing
    }
  }
}
