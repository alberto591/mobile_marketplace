import { describe, expect, it } from 'vitest';
import {
  buildMissingPartWhatsAppMessage,
  openMissingPartWhatsApp,
} from '../services/whatsapp-contact.service';
import {
  filterMakeSuggestions,
  filterModelSuggestions,
} from '../services/vehicle-suggestions.service';
import {
  addRecentSearchEntry,
  clearRecentSearches,
  formatRecentSearchLabel,
  loadRecentSearches,
  saveRecentSearch,
  type RecentSearchStorage,
} from '../services/recent-searches.service';

function createMemoryStorage(): RecentSearchStorage {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}

describe('Quick Win 1: 0-Result Missing Part WhatsApp Lead Capture', () => {
  it('builds a prefilled Spanish WhatsApp message with query, OEM, and vehicle', () => {
    const msg = buildMissingPartWhatsAppMessage({
      query: 'Faro izquierdo',
      oemReference: '1K0941005',
      vehicleMake: 'Volkswagen',
      vehicleModel: 'Golf',
      vehicleYear: 2008,
      vendorTradeName: 'Eurodesguace Málaga',
    });

    expect(msg).toContain('Hola Eurodesguace Málaga');
    expect(msg).toContain('"Faro izquierdo"');
    expect(msg).toContain('ref. OEM 1K0941005');
    expect(msg).toContain('para Volkswagen Golf (2008)');
  });

  it('opens wa.me URL when native whatsapp scheme is unavailable', async () => {
    const opened: string[] = [];
    const ok = await openMissingPartWhatsApp({
      query: 'Alternador',
      publicPhone: '952000111',
      urlOpener: {
        canOpenURL: async () => false,
        openURL: async (url) => {
          opened.push(url);
        },
      },
    });

    expect(ok).toBe(true);
    expect(opened[0]).toContain('https://wa.me/34952000111?text=');
    expect(decodeURIComponent(opened[0])).toContain('Alternador');
  });
});

describe('Quick Win 3: Catalog-Backed Vehicle Make & Model Suggestions', () => {
  const catalogVehicles = [
    { make: 'VOLKSWAGEN', models: ['GOLF', 'PASSAT', 'POLO'] },
    { make: 'MERCEDES-BENZ', models: ['CLASE A', 'CLASE C'] },
    { make: 'CITROËN', models: ['C4', 'BERLINGO'] },
    { make: 'SEAT', models: ['LEÓN', 'IBIZA'] },
  ];

  it('expands common Spanish abbreviations like VW and Mercedes', () => {
    expect(filterMakeSuggestions(catalogVehicles, 'vw')).toEqual(['VOLKSWAGEN']);
    expect(filterMakeSuggestions(catalogVehicles, 'mercedes')).toEqual(['MERCEDES-BENZ']);
    expect(filterMakeSuggestions(catalogVehicles, 'citroen')).toEqual(['CITROËN']);
  });

  it('filters models for a selected make ignoring accents', () => {
    expect(filterModelSuggestions(catalogVehicles, 'vw', 'go')).toEqual(['GOLF']);
    expect(filterModelSuggestions(catalogVehicles, 'Seat', 'leo')).toEqual(['LEÓN']);
    expect(filterModelSuggestions(catalogVehicles, 'VOLKSWAGEN', '')).toEqual([
      'GOLF',
      'PASSAT',
      'POLO',
    ]);
  });
});

describe('Quick Win 4: Recent Searches Persistence', () => {
  it('deduplicates searches, keeps most recent first, and caps at 5 items', () => {
    let list = addRecentSearchEntry([], { query: 'Faro', vehicleMake: 'SEAT' }, 1);
    list = addRecentSearchEntry(list, { query: 'Alternador' }, 2);
    list = addRecentSearchEntry(list, { query: 'Radiador' }, 3);
    list = addRecentSearchEntry(list, { query: 'Turbo' }, 4);
    list = addRecentSearchEntry(list, { query: 'Retrovisor' }, 5);
    list = addRecentSearchEntry(list, { query: 'Bomba' }, 6);
    expect(list.length).toBe(5);
    expect(list[0].query).toBe('Bomba');
    expect(list.find((x) => x.query === 'Faro')).toBeUndefined();

    // Deduplicate existing entry and move to front
    list = addRecentSearchEntry(list, { query: 'Turbo' }, 7);
    expect(list.length).toBe(5);
    expect(list[0].query).toBe('Turbo');
  });

  it('formats readable chip labels and persists via AsyncStorage interface', async () => {
    const storage = createMemoryStorage();
    await saveRecentSearch({ query: 'Faro', vehicleMake: 'VW', vehicleModel: 'Golf' }, storage);
    const loaded = await loadRecentSearches(storage);
    expect(loaded).toHaveLength(1);
    expect(formatRecentSearchLabel(loaded[0])).toBe('Faro · VW Golf');

    await clearRecentSearches(storage);
    expect(await loadRecentSearches(storage)).toEqual([]);
  });
});
