import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Proposed contract schema for VextCentral parts once API specifications are provided
export const VextCentralRawPartSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  price: z.number().nonnegative(),
  currency: z.string().default('EUR'),
  stock: z.number().int().nonnegative().default(1),
  oemReference: z.string().optional(),
  vehicle: z
    .object({
      make: z.string().optional(),
      model: z.string().optional(),
      year: z.number().int().optional(),
    })
    .optional(),
  images: z.array(z.string().url()).default([]),
});

describe('VextCentral Contract Preparation', () => {
  it('validates a well-formed VextCentral part specification draft', () => {
    const raw = {
      id: 'VC-PART-001',
      description: 'Motor de arranque 1.9 TDI',
      price: 85.5,
      currency: 'EUR',
      stock: 1,
      oemReference: '02A911023J',
      vehicle: {
        make: 'VOLKSWAGEN',
        model: 'GOLF',
        year: 2005,
      },
      images: ['https://images.example.com/vc-001.jpg'],
    };

    const parsed = VextCentralRawPartSchema.parse(raw);
    expect(parsed.id).toBe('VC-PART-001');
    expect(parsed.price).toBe(85.5);
  });

  it('rejects parts with missing mandatory identifier or description', () => {
    expect(() =>
      VextCentralRawPartSchema.parse({
        id: '',
        description: 'Compresor',
        price: 50,
      })
    ).toThrow();

    expect(() =>
      VextCentralRawPartSchema.parse({
        id: 'VC-002',
        description: '',
        price: 50,
      })
    ).toThrow();
  });
});
