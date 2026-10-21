import type { ICartStorage } from './cart-storage';
import { AsyncStorageCartStorage } from './cart-storage';

export const GARAGE_STORAGE_KEY = '@buscapiezas:garage_vehicle_v1';

export interface SavedVehicle {
  readonly make: string;
  readonly model: string;
  readonly year?: number;
  readonly engineCode?: string;
  readonly fuel?: string;
}

export function serializeSavedVehicle(vehicle: SavedVehicle | null): string {
  if (!vehicle) return '';
  return JSON.stringify(vehicle);
}

export function deserializeSavedVehicle(raw: string | null): SavedVehicle | null {
  if (!raw || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.make !== 'string' || !parsed.make.trim()) return null;
    if (typeof parsed.model !== 'string' || !parsed.model.trim()) return null;

    return Object.freeze({
      make: parsed.make.trim(),
      model: parsed.model.trim(),
      year: typeof parsed.year === 'number' && !isNaN(parsed.year) ? parsed.year : undefined,
      engineCode:
        typeof parsed.engineCode === 'string' && parsed.engineCode.trim().length > 0
          ? parsed.engineCode.trim()
          : undefined,
      fuel:
        typeof parsed.fuel === 'string' && parsed.fuel.trim().length > 0
          ? parsed.fuel.trim()
          : undefined,
    });
  } catch {
    return null;
  }
}

export class GarageStorageService {
  constructor(private readonly storage: ICartStorage = new AsyncStorageCartStorage()) {}

  async loadVehicle(): Promise<SavedVehicle | null> {
    try {
      const raw = await this.storage.getItem(GARAGE_STORAGE_KEY);
      return deserializeSavedVehicle(raw);
    } catch {
      return null;
    }
  }

  async saveVehicle(vehicle: SavedVehicle | null): Promise<void> {
    try {
      if (!vehicle) {
        await this.storage.removeItem(GARAGE_STORAGE_KEY);
      } else {
        const serialized = serializeSavedVehicle(vehicle);
        await this.storage.setItem(GARAGE_STORAGE_KEY, serialized);
      }
    } catch {
      // Storage errors fail gracefully without crashing
    }
  }
}
