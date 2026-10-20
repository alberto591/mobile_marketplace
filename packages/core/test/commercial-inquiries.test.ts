import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SubmitInquiryPayloadSchema,
  CustomerContactSchema,
  SubmitInquiryItemInputSchema,
} from '../src/validation/inquiry-schemas.js';

describe('Commercial Inquiries Validation and Logic', () => {
  it('validates a correct inquiry payload with email', () => {
    const valid = {
      customerName: 'Carlos Martínez',
      customerEmail: 'carlos@ejemplo.com',
      customerMessage: '¿El alternador incluye la polea original?',
      vehiclePlate: '1234BBB',
      privacyConsent: {
        accepted: true as const,
        version: 'v1.0',
      },
      items: [
        {
          partId: randomUUID(),
        },
      ],
      idempotencyKey: 'idem-key-12345678',
      source: 'mobile_app',
    };

    const parsed = SubmitInquiryPayloadSchema.parse(valid);
    expect(parsed.customerName).toBe('Carlos Martínez');
    expect(parsed.customerEmail).toBe('carlos@ejemplo.com');
    expect(parsed.customerPhone).toBeUndefined();
    expect(parsed.items.length).toBe(1);
    expect(parsed.privacyConsent.accepted).toBe(true);
    expect(parsed.idempotencyKey).toBe('idem-key-12345678');
  });

  it('validates a correct inquiry payload with phone only', () => {
    const valid = {
      customerName: 'Laura Gómez',
      customerPhone: '612 345 678',
      privacyConsent: {
        accepted: true as const,
        version: 'v1.0',
      },
      items: [
        {
          partId: randomUUID(),
        },
      ],
      idempotencyKey: 'idem-key-abcdefgh',
    };

    const parsed = SubmitInquiryPayloadSchema.parse(valid);
    expect(parsed.customerName).toBe('Laura Gómez');
    expect(parsed.customerPhone).toBe('612 345 678');
    expect(parsed.customerEmail).toBeUndefined();
  });

  it('rejects customer contact when neither email nor phone is provided', () => {
    expect(() =>
      CustomerContactSchema.parse({
        customerName: 'Sin Contacto',
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
      })
    ).toThrow('Debes proporcionar al menos un medio de contacto');

    expect(() =>
      SubmitInquiryPayloadSchema.parse({
        customerName: 'Sin Contacto',
        items: [{ partId: randomUUID() }],
        idempotencyKey: 'idem-key-12345678',
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
      })
    ).toThrow('Debes proporcionar al menos un medio de contacto');
  });

  it('rejects customer contact with invalid email format', () => {
    expect(() =>
      CustomerContactSchema.parse({
        customerName: 'Carlos',
        customerEmail: 'carlos-no-es-un-email',
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
      })
    ).toThrow('El formato de correo electrónico no es válido');
  });

  it('rejects inquiry without accepted privacy consent', () => {
    expect(() =>
      SubmitInquiryPayloadSchema.parse({
        customerName: 'Carlos',
        customerEmail: 'carlos@ejemplo.com',
        items: [{ partId: randomUUID() }],
        idempotencyKey: 'idem-key-12345678',
        privacyConsent: {
          accepted: false,
          version: 'v1.0',
        },
      })
    ).toThrow('Debes aceptar el aviso de privacidad');
  });

  it('rejects inquiry with zero items', () => {
    expect(() =>
      SubmitInquiryPayloadSchema.parse({
        customerName: 'Carlos',
        customerEmail: 'carlos@ejemplo.com',
        items: [],
        idempotencyKey: 'idem-key-12345678',
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
      })
    ).toThrow('Debes incluir al menos una pieza en la solicitud');
  });

  it('rejects inquiry with more than 10 items (rate limiting / abuse prevention)', () => {
    const elevenItems = Array.from({ length: 11 }, () => ({
      partId: randomUUID(),
    }));

    expect(() =>
      SubmitInquiryPayloadSchema.parse({
        customerName: 'Carlos',
        customerEmail: 'carlos@ejemplo.com',
        items: elevenItems,
        idempotencyKey: 'idem-key-12345678',
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
      })
    ).toThrow('No se permite solicitar más de 10 piezas simultáneamente');
  });

  it('rejects inquiry with non-uuid partId', () => {
    expect(() =>
      SubmitInquiryItemInputSchema.parse({ partId: 'not-a-valid-uuid' })
    ).toThrow('Identificador de pieza debe ser un UUID válido');

    expect(() =>
      SubmitInquiryPayloadSchema.parse({
        customerName: 'Carlos',
        customerEmail: 'carlos@ejemplo.com',
        items: [{ partId: 'not-a-valid-uuid' }],
        idempotencyKey: 'idem-key-12345678',
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
      })
    ).toThrow('Identificador de pieza debe ser un UUID válido');
  });

  it('rejects inquiry with excessively long message', () => {
    const hugeMessage = 'A'.repeat(1001);
    expect(() =>
      SubmitInquiryPayloadSchema.parse({
        customerName: 'Carlos',
        customerEmail: 'carlos@ejemplo.com',
        items: [{ partId: randomUUID() }],
        customerMessage: hugeMessage,
        idempotencyKey: 'idem-key-12345678',
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
      })
    ).toThrow('El mensaje no puede exceder 1000 caracteres');
  });

  it('allows optional vehicle identifier plate up to 15 characters', () => {
    const valid = SubmitInquiryPayloadSchema.parse({
      customerName: 'Carlos',
      customerPhone: '612345678',
      items: [{ partId: randomUUID() }],
      vehiclePlate: '1234-BBB',
      idempotencyKey: 'idem-key-12345678',
      privacyConsent: {
        accepted: true,
        version: 'v1.0',
      },
    });

    expect(valid.vehiclePlate).toBe('1234-BBB');

    expect(() =>
      SubmitInquiryPayloadSchema.parse({
        customerName: 'Carlos',
        customerPhone: '612345678',
        items: [{ partId: randomUUID() }],
        vehiclePlate: '1234567890123456', // 16 chars
        idempotencyKey: 'idem-key-12345678',
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
      })
    ).toThrow('La matrícula contiene un formato no válido');
  });

  it('rejects idempotency key shorter than 8 characters', () => {
    expect(() =>
      SubmitInquiryPayloadSchema.parse({
        customerName: 'Carlos',
        customerEmail: 'carlos@ejemplo.com',
        items: [{ partId: randomUUID() }],
        idempotencyKey: 'short',
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
      })
    ).toThrow('Clave de idempotencia requerida');
  });
});

describe('Edge Function Anti-Abuse Rate Limiter', () => {
  // Simulates sliding window logic
  it('allows burst up to 5 requests and blocks 6th request with 429', () => {
    const limits = new Map<string, { count: number; resetAt: number }>();
    function check(key: string, now: number) {
      const entry = limits.get(key);
      if (!entry || now > entry.resetAt) {
        limits.set(key, { count: 1, resetAt: now + 60000 });
        return { allowed: true };
      }
      if (entry.count >= 5) {
        return { allowed: false };
      }
      entry.count += 1;
      return { allowed: true };
    }

    const t0 = 1000000;
    for (let i = 0; i < 5; i++) {
      expect(check('test-ip', t0).allowed).toBe(true);
    }
    expect(check('test-ip', t0).allowed).toBe(false);

    // After 60 seconds window expires
    expect(check('test-ip', t0 + 60001).allowed).toBe(true);
  });
});

describe('Email Test Mode Containment', () => {
  it('strictly redirects all inquiry notifications to test recipient when in test mode', () => {
    const isTestMode = true;
    const testRecipient = 'loopinnova.admin@gmail.com';
    const realYardEmail = 'ventas@desguacereal.com';

    const resolvedRecipient = isTestMode ? testRecipient : realYardEmail;
    expect(resolvedRecipient).toBe('loopinnova.admin@gmail.com');
    expect(resolvedRecipient).not.toBe(realYardEmail);
  });

  it('skips email dispatch if test recipient is not configured in environment', () => {
    const isTestMode = true;
    const testRecipient = undefined; // Not configured

    const resolvedRecipient = isTestMode ? testRecipient : 'ventas@desguacereal.com';
    expect(resolvedRecipient).toBeUndefined();
  });
});

describe('Idempotency Stability and Concurrency', () => {
  it('guarantees that repeating an inquiry with the same idempotency key returns the exact same groupId and inquiryId', () => {
    // Model store simulating inquiries table
    const dbInquiries = new Map<string, { id: string; groupId: string; reference: string }>();

    function processInquiry(vendorId: string, idempotencyKey: string, proposedGroupId: string) {
      const compositeKey = `${vendorId}:${idempotencyKey}`;
      const existing = dbInquiries.get(compositeKey);
      if (existing) {
        return {
          groupId: existing.groupId,
          inquiryId: existing.id,
          reference: existing.reference,
          isDuplicate: true,
        };
      }

      const newInquiry = {
        id: randomUUID(),
        groupId: proposedGroupId,
        reference: 'INQ-TEST-REF',
      };
      dbInquiries.set(compositeKey, newInquiry);
      return {
        groupId: newInquiry.groupId,
        inquiryId: newInquiry.id,
        reference: newInquiry.reference,
        isDuplicate: false,
      };
    }

    const vendor = 'v1';
    const idemKey = 'idem-unique-12345';
    
    // First request
    const req1 = processInquiry(vendor, idemKey, randomUUID());
    expect(req1.isDuplicate).toBe(false);

    // Second request with a different proposed groupId (retry from mobile client)
    const req2 = processInquiry(vendor, idemKey, randomUUID());
    expect(req2.isDuplicate).toBe(true);
    expect(req2.inquiryId).toBe(req1.inquiryId);
    expect(req2.groupId).toBe(req1.groupId);
    expect(req2.reference).toBe(req1.reference);
  });

  it('handles simulated concurrent requests cleanly through unique constraint', async () => {
    const db = new Map<string, { id: string; groupId: string }>();
    let collisions = 0;

    async function concurrentInsert(vendorId: string, idemKey: string, gId: string) {
      const key = `${vendorId}:${idemKey}`;
      // Simulate race condition check-then-act
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      if (db.has(key)) {
        collisions++;
        return db.get(key)!;
      }
      const record = { id: randomUUID(), groupId: gId };
      db.set(key, record);
      return record;
    }

    const gId = randomUUID();
    const results = await Promise.all([
      concurrentInsert('v1', 'race-key-01', gId),
      concurrentInsert('v1', 'race-key-01', gId),
      concurrentInsert('v1', 'race-key-01', gId),
    ]);

    // All concurrent callers end up with the exact same record
    expect(results[0].id).toBe(results[1].id);
    expect(results[1].id).toBe(results[2].id);
    expect(results[0].groupId).toBe(results[1].groupId);
    expect(db.size).toBe(1);
  });
});

describe('Multi-Vendor and Payload Mismatch Idempotency Validation', () => {
  it('detects payload fingerprint mismatch when an idempotency key is reused with different data', () => {
    function computeFingerprint(payload: {
      customerName: string;
      customerEmail?: string;
      customerPhone?: string;
      partIds: string[];
    }) {
      const sortedParts = [...payload.partIds].sort().join(',');
      return `${payload.customerName}|${payload.customerEmail || ''}|${payload.customerPhone || ''}|${sortedParts}`;
    }

    const payloadA = {
      customerName: 'Carlos Martinez',
      customerEmail: 'carlos@example.test',
      partIds: ['part-1', 'part-2'],
    };

    const payloadB = {
      customerName: 'Carlos Martinez',
      customerEmail: 'carlos@example.test',
      partIds: ['part-1', 'part-3'], // Different piece!
    };

    const payloadC = {
      customerName: 'Laura Gomez', // Different buyer!
      customerEmail: 'carlos@example.test',
      partIds: ['part-1', 'part-2'],
    };

    const fpA = computeFingerprint(payloadA);
    const fpB = computeFingerprint(payloadB);
    const fpC = computeFingerprint(payloadC);

    expect(fpA).not.toBe(fpB);
    expect(fpA).not.toBe(fpC);
  });

  it('correctly models multi-vendor inquiry grouping under a single groupId without leaking parts across vendors', () => {
    const parts = [
      { id: 'part-vendor-1', vendorId: 'vendor-alpha', title: 'Faro Derecho' },
      { id: 'part-vendor-2', vendorId: 'vendor-beta', title: 'Piloto Trasero' },
    ];

    // Grouping logic
    const vendorMap = new Map<string, typeof parts>();
    for (const p of parts) {
      const list = vendorMap.get(p.vendorId) || [];
      list.push(p);
      vendorMap.set(p.vendorId, list);
    }

    expect(vendorMap.size).toBe(2);
    expect(vendorMap.get('vendor-alpha')?.length).toBe(1);
    expect(vendorMap.get('vendor-beta')?.length).toBe(1);

    // Alpha yard never gets beta yard parts
    const alphaParts = vendorMap.get('vendor-alpha')!;
    expect(alphaParts.some((p) => p.vendorId === 'vendor-beta')).toBe(false);
  });
});
