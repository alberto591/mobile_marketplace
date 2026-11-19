import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_SEARCHES_STORAGE_KEY = '@mobile_marketplace_recent_searches_v1';
export const MAX_RECENT_SEARCHES = 5;

export interface RecentSearchEntry {
  readonly query?: string;
  readonly oemReference?: string;
  readonly vehicleMake?: string;
  readonly vehicleModel?: string;
  readonly vehicleYear?: string;
  readonly timestamp: number;
}

export interface RecentSearchStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function normalizeField(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function buildSearchKey(entry: Omit<RecentSearchEntry, 'timestamp'>): string {
  return [
    entry.query?.toLowerCase() ?? '',
    entry.oemReference?.toUpperCase() ?? '',
    entry.vehicleMake?.toLowerCase() ?? '',
    entry.vehicleModel?.toLowerCase() ?? '',
    entry.vehicleYear ?? '',
  ].join('|');
}

/**
 * Formats a concise, human-readable label for a recent search chip.
 */
export function formatRecentSearchLabel(entry: Omit<RecentSearchEntry, 'timestamp'>): string {
  const parts: string[] = [];
  if (entry.query) parts.push(entry.query);
  if (entry.oemReference) parts.push(`OEM ${entry.oemReference}`);
  const vehicle = [entry.vehicleMake, entry.vehicleModel, entry.vehicleYear]
    .filter(Boolean)
    .join(' ');
  if (vehicle) parts.push(vehicle);
  return parts.join(' · ') || 'Búsqueda';
}

/**
 * Pure reducer that inserts a search at the front, deduplicates, and caps list length.
 */
export function addRecentSearchEntry(
  existing: readonly RecentSearchEntry[],
  input: Omit<RecentSearchEntry, 'timestamp'>,
  now = Date.now(),
  maxItems = MAX_RECENT_SEARCHES
): readonly RecentSearchEntry[] {
  const cleaned: Omit<RecentSearchEntry, 'timestamp'> = {
    query: normalizeField(input.query),
    oemReference: normalizeField(input.oemReference),
    vehicleMake: normalizeField(input.vehicleMake),
    vehicleModel: normalizeField(input.vehicleModel),
    vehicleYear: normalizeField(input.vehicleYear),
  };

  if (!cleaned.query && !cleaned.oemReference && !cleaned.vehicleMake && !cleaned.vehicleModel) {
    return existing;
  }

  const newKey = buildSearchKey(cleaned);
  const filtered = existing.filter((item) => buildSearchKey(item) !== newKey);
  const next: RecentSearchEntry = { ...cleaned, timestamp: now };
  return [next, ...filtered].slice(0, maxItems);
}

export async function loadRecentSearches(
  storage: RecentSearchStorage = AsyncStorage
): Promise<readonly RecentSearchEntry[]> {
  try {
    const raw = await storage.getItem(RECENT_SEARCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentSearchEntry => Boolean(item && typeof item === 'object'))
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export async function saveRecentSearch(
  input: Omit<RecentSearchEntry, 'timestamp'>,
  storage: RecentSearchStorage = AsyncStorage
): Promise<readonly RecentSearchEntry[]> {
  const current = await loadRecentSearches(storage);
  const updated = addRecentSearchEntry(current, input);
  try {
    await storage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Non-fatal: search still proceeds even if local storage fails.
  }
  return updated;
}

export async function clearRecentSearches(
  storage: RecentSearchStorage = AsyncStorage
): Promise<void> {
  try {
    await storage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  } catch {
    // Non-fatal
  }
}
