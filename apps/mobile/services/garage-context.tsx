import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ICartStorage } from './cart-storage';
import { AsyncStorageCartStorage } from './cart-storage';
import type { SavedVehicle } from './garage.service';
import { GarageStorageService } from './garage.service';

export interface GarageContextValue {
  readonly selectedVehicle: SavedVehicle | null;
  readonly hasVehicle: boolean;
  readonly isLoaded: boolean;
  setVehicle(vehicle: SavedVehicle): Promise<void>;
  clearVehicle(): Promise<void>;
}

const GarageContext = createContext<GarageContextValue | null>(null);

export interface GarageProviderProps {
  readonly children: React.ReactNode;
  readonly storage?: ICartStorage;
}

export function GarageProvider({ children, storage }: GarageProviderProps) {
  const [selectedVehicle, setSelectedVehicleState] = useState<SavedVehicle | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const cartStorage = useMemo(() => storage ?? new AsyncStorageCartStorage(), [storage]);
  const storageService = useMemo(() => new GarageStorageService(cartStorage), [cartStorage]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const vehicle = await storageService.loadVehicle();
        if (isMounted) {
          setSelectedVehicleState(vehicle);
        }
      } catch {
        // Fallback to null gracefully
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

  const setVehicle = async (vehicle: SavedVehicle): Promise<void> => {
    setSelectedVehicleState(vehicle);
    await storageService.saveVehicle(vehicle);
  };

  const clearVehicle = async (): Promise<void> => {
    setSelectedVehicleState(null);
    await storageService.saveVehicle(null);
  };

  const value = useMemo<GarageContextValue>(() => {
    return {
      selectedVehicle,
      hasVehicle: selectedVehicle !== null,
      isLoaded,
      setVehicle,
      clearVehicle,
    };
  }, [selectedVehicle, isLoaded]);

  return <GarageContext.Provider value={value}>{children}</GarageContext.Provider>;
}

export function useGarage(): GarageContextValue {
  const ctx = useContext(GarageContext);
  if (!ctx) {
    throw new Error('useGarage must be used within a GarageProvider');
  }
  return ctx;
}
