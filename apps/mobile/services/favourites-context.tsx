import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ICartStorage } from './cart-storage';
import { AsyncStorageCartStorage } from './cart-storage';
import {
  addFavouriteId,
  deserializeFavouriteIds,
  FAVOURITES_STORAGE_KEY,
  FavouritesStorageService,
  removeFavouriteId,
  serializeFavouriteIds,
  toggleFavouriteId,
} from './favourites.service';

export interface FavouritesContextValue {
  readonly savedPartIds: readonly string[];
  readonly savedCount: number;
  readonly isLoaded: boolean;
  isSaved(partId: string): boolean;
  toggleSaved(partId: string): Promise<boolean>;
  removeSaved(partId: string): Promise<void>;
  addSaved(partId: string): Promise<void>;
}

const FavouritesContext = createContext<FavouritesContextValue | null>(null);

export interface FavouritesProviderProps {
  readonly children: React.ReactNode;
  readonly storage?: ICartStorage;
}

export function FavouritesProvider({ children, storage }: FavouritesProviderProps) {
  const [savedPartIds, setSavedPartIds] = useState<readonly string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const cartStorage = useMemo(() => storage ?? new AsyncStorageCartStorage(), [storage]);
  const storageService = useMemo(() => new FavouritesStorageService(cartStorage), [cartStorage]);

  // Load from local storage on mount
  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const ids = await storageService.loadFavourites();
        if (isMounted) {
          setSavedPartIds(ids);
        }
      } catch {
        // Fallback to empty list gracefully
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [storageService]);

  // Persist whenever savedPartIds changes (after initial load)
  useEffect(() => {
    if (!isLoaded) return;
    storageService.saveFavourites(savedPartIds).catch(() => {
      // Storage error handled gracefully
    });
  }, [savedPartIds, isLoaded, storageService]);

  const isSaved = (partId: string): boolean => {
    if (!partId) return false;
    return savedPartIds.includes(partId.trim());
  };

  const toggleSaved = async (partId: string): Promise<boolean> => {
    const { updated, isAdded } = toggleFavouriteId(savedPartIds, partId);
    setSavedPartIds(updated);
    return isAdded;
  };

  const removeSaved = async (partId: string): Promise<void> => {
    const updated = removeFavouriteId(savedPartIds, partId);
    setSavedPartIds(updated);
  };

  const addSaved = async (partId: string): Promise<void> => {
    const updated = addFavouriteId(savedPartIds, partId);
    setSavedPartIds(updated);
  };

  const value = useMemo<FavouritesContextValue>(() => {
    return {
      savedPartIds,
      savedCount: savedPartIds.length,
      isLoaded,
      isSaved,
      toggleSaved,
      removeSaved,
      addSaved,
    };
  }, [savedPartIds, isLoaded]);

  return <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>;
}

export function useFavourites(): FavouritesContextValue {
  const ctx = useContext(FavouritesContext);
  if (!ctx) {
    throw new Error('useFavourites must be used within a FavouritesProvider');
  }
  return ctx;
}
