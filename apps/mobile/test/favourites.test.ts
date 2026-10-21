import { describe, expect, it } from 'vitest';
import {
  addFavouriteId,
  deserializeFavouriteIds,
  FavouritesStorageService,
  removeFavouriteId,
  serializeFavouriteIds,
  toggleFavouriteId,
} from '../services/favourites.service';
import { MemoryCartStorage } from '../services/cart-storage';

describe('Feature 4: Favourites and Saved Parts Service', () => {
  it('deserializes null or empty string to an empty array', () => {
    expect(deserializeFavouriteIds(null)).toEqual([]);
    expect(deserializeFavouriteIds('')).toEqual([]);
    expect(deserializeFavouriteIds('   ')).toEqual([]);
    expect(deserializeFavouriteIds('{ invalid json')).toEqual([]);
  });

  it('filters invalid elements and deduplicates saved IDs upon deserialization', () => {
    const raw = JSON.stringify(['part-1', '', 'part-2', 123, null, 'part-1', '  part-3  ']);
    const ids = deserializeFavouriteIds(raw);
    expect(ids).toEqual(['part-1', 'part-2', 'part-3']);
  });

  it('serializes saved IDs into a clean JSON string without duplicates', () => {
    const ids = ['part-A', 'part-B', 'part-A'];
    const serialized = serializeFavouriteIds(ids);
    expect(JSON.parse(serialized)).toEqual(['part-A', 'part-B']);
  });

  it('adds new part IDs at the beginning without duplicating existing IDs', () => {
    const initial = ['part-1', 'part-2'];
    const updated = addFavouriteId(initial, 'part-3');
    expect(updated).toEqual(['part-3', 'part-1', 'part-2']);

    const duplicateAttempt = addFavouriteId(updated, 'part-1');
    expect(duplicateAttempt).toEqual(['part-3', 'part-1', 'part-2']);
    expect(duplicateAttempt).toBe(updated); // Pure reference equality
  });

  it('removes part IDs cleanly', () => {
    const initial = ['part-1', 'part-2', 'part-3'];
    const updated = removeFavouriteId(initial, 'part-2');
    expect(updated).toEqual(['part-1', 'part-3']);

    const notFound = removeFavouriteId(updated, 'part-999');
    expect(notFound).toBe(updated);
  });

  it('toggles favourite state correctly', () => {
    const initial: string[] = ['part-1'];
    
    // Toggle on
    const res1 = toggleFavouriteId(initial, 'part-2');
    expect(res1.isAdded).toBe(true);
    expect(res1.updated).toEqual(['part-2', 'part-1']);

    // Toggle off
    const res2 = toggleFavouriteId(res1.updated, 'part-1');
    expect(res2.isAdded).toBe(false);
    expect(res2.updated).toEqual(['part-2']);
  });

  it('persists and loads favourites via FavouritesStorageService', async () => {
    const memoryStorage = new MemoryCartStorage();
    const service = new FavouritesStorageService(memoryStorage);

    const initial = await service.loadFavourites();
    expect(initial).toEqual([]);

    await service.saveFavourites(['part-100', 'part-200']);
    const loaded = await service.loadFavourites();
    expect(loaded).toEqual(['part-100', 'part-200']);
  });

  it('handles storage read/write exceptions gracefully without throwing', async () => {
    const faultyStorage = {
      getItem: async () => {
        throw new Error('Disk error');
      },
      setItem: async () => {
        throw new Error('Write failed');
      },
      removeItem: async () => {
        throw new Error('Remove failed');
      },
    };

    const service = new FavouritesStorageService(faultyStorage);
    const loaded = await service.loadFavourites();
    expect(loaded).toEqual([]);

    await expect(service.saveFavourites(['part-1'])).resolves.not.toThrow();
  });
});
