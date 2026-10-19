import { z } from 'zod';

/**
 * Zod schema for Eurodesguace list response metadata.
 */
export const EurodesguaceMetaSchema = z.object({
  count: z.number().nonnegative(),
  limit: z.number().positive(),
  next_cursor: z.union([z.string(), z.number()]).nullable().optional(),
  total: z.number().nonnegative(),
  pii: z.boolean().optional(),
});

export type EurodesguaceMeta = z.infer<typeof EurodesguaceMetaSchema>;

/**
 * Zod schema for an item in the Eurodesguace parts catalog.
 * Handles empty strings as null/absent as declared in the integration manual.
 */
export const EurodesguaceRawPartSchema = z.object({
  refid: z.union([z.string(), z.number()]).transform((val) => String(val).trim()),
  familia: z.string().default(''),
  articulo: z.string().default(''),
  marca: z.string().default(''),
  modelo: z.string().default(''),
  modeloinicio: z.union([z.string(), z.number()]).nullable().optional(),
  modelofin: z.union([z.string(), z.number()]).nullable().optional(),
  motorversion: z.string().nullable().optional(),
  cambioversion: z.string().nullable().optional(),
  refvisual: z.string().nullable().optional().transform((v) => (v && v.trim() !== '' ? v.trim() : null)).optional(),
  refcatalogo: z.string().nullable().optional().transform((v) => (v && v.trim() !== '' ? v.trim() : null)).optional(),
  attrib1: z.string().nullable().optional(),
  attrib2: z.string().nullable().optional(),
  precio: z.union([z.string(), z.number()]).transform((val) => String(val).trim()),
  estado: z.string().nullable().optional().transform((v) => (v && v.trim() !== '' ? v.trim() : null)).optional(),
  ubicacion: z.string().nullable().optional(),
  anopieza: z.union([z.string(), z.number()]).nullable().optional().transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 1900 ? n : null;
  }).optional(),
  notapublica: z.string().nullable().optional().transform((v) => (v && v.trim() !== '' ? v.trim() : null)).optional(),
  ean: z.string().nullable().optional(),
  peso: z.union([z.string(), z.number()]).nullable().optional().transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }).optional(),
  codvehiculo: z.union([z.string(), z.number()]).nullable().optional().transform((v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s !== '' ? s : null;
  }).optional(),
  imgs: z.array(z.string().url()).nullable().optional().default([]),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional().transform((v) => (v && v.trim() !== '' ? v.trim() : null)).optional(),
});

export type EurodesguaceRawPart = z.infer<typeof EurodesguaceRawPartSchema>;

/**
 * Zod schema for Eurodesguace parts listing response.
 */
export const EurodesguacePartsResponseSchema = z.object({
  data: z.array(EurodesguaceRawPartSchema),
  meta: EurodesguaceMetaSchema,
});

export type EurodesguacePartsResponse = z.infer<typeof EurodesguacePartsResponseSchema>;

/**
 * Zod schema for single part detail response.
 */
export const EurodesguacePartDetailResponseSchema = z.object({
  data: EurodesguaceRawPartSchema,
});

export type EurodesguacePartDetailResponse = z.infer<typeof EurodesguacePartDetailResponseSchema>;

/**
 * Zod schema for Eurodesguace vehicle.
 */
export const EurodesguaceRawVehicleSchema = z.object({
  codvehiculo: z.union([z.string(), z.number()]).transform((val) => String(val).trim()),
  marca: z.string().default(''),
  modelo: z.string().default(''),
  anoversion: z.union([z.string(), z.number()]).nullable().optional().transform((v) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 1900 ? n : null;
  }),
  kilometraje: z.union([z.string(), z.number()]).nullable().optional().transform((v) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }),
  imgs: z.array(z.string().url()).nullable().optional().default([]),
  codigomotor: z.string().nullable().optional().transform((v) => (v && v.trim() !== '' ? v.trim() : null)),
  puertas: z.union([z.string(), z.number()]).nullable().optional().transform((v) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }),
  tipocombustible: z.string().nullable().optional().transform((v) => (v && v.trim() !== '' ? v.trim() : null)),
  color: z.string().nullable().optional(),
  notapublica: z.string().nullable().optional(),
  codigocambio: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional().transform((v) => (v && v.trim() !== '' ? v.trim() : null)),
});

export type EurodesguaceRawVehicle = z.infer<typeof EurodesguaceRawVehicleSchema>;

/**
 * Zod schema for Eurodesguace health response.
 */
export const EurodesguaceHealthResponseSchema = z.object({
  data: z.object({
    status: z.string(),
    site: z.string().optional(),
    environment: z.string().optional(),
    time: z.string().optional(),
    key: z.object({
      name: z.string().optional(),
      scopes: z.array(z.string()).optional(),
    }).optional(),
  }),
});

export type EurodesguaceHealthResponse = z.infer<typeof EurodesguaceHealthResponseSchema>;

/**
 * Structured API Error from Eurodesguace.
 */
export interface EurodesguaceApiErrorDetails {
  readonly statusCode: number;
  readonly errorType: string;
  readonly message: string;
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;
}
