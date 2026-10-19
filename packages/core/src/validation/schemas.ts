import { z } from 'zod';

export const CurrencyCodeSchema = z.literal('EUR');

export const MoneySchema = z.object({
  amountInCents: z.number().int().nonnegative({
    message: 'Amount in cents must be a non-negative integer',
  }),
  currency: CurrencyCodeSchema,
});

export const AvailabilityStatusSchema = z.enum([
  'AVAILABLE',
  'OUT_OF_STOCK',
  'RESERVED',
  'PENDING_CONFIRMATION',
  'WITHDRAWN',
]);

export const AvailabilitySchema = z.object({
  status: AvailabilityStatusSchema,
  stockQuantity: z.number().int().nonnegative({
    message: 'Stock quantity cannot be negative',
  }),
  lastCheckedAt: z.date().default(() => new Date()),
  leadTimeDays: z.number().int().positive().optional(),
  statusReason: z.string().optional(),
});

export const OEMReferenceTypeSchema = z.enum([
  'OEM_OFFICIAL',
  'REFERENCIA_VISUAL',
  'CATALOGO_PROVEEDOR',
  'CROSS_REFERENCE',
]);

export const OEMReferenceInputSchema = z.object({
  raw: z.string().min(2, { message: 'OEM reference must have at least 2 characters' }),
  isPrimary: z.boolean().default(true),
  brandName: z.string().optional(),
  referenceType: OEMReferenceTypeSchema.optional(),
});

export const FuelTypeSchema = z.enum([
  'GASOLINE',
  'DIESEL',
  'HYBRID',
  'ELECTRIC',
  'LPG',
  'CNG',
  'OTHER',
]);

export const TransmissionTypeSchema = z.enum([
  'MANUAL',
  'AUTOMATIC',
  'SEMI_AUTOMATIC',
  'OTHER',
]);

export const VehicleSchema = z.object({
  make: z.string().min(1, { message: 'Vehicle make is required' }),
  model: z.string().min(1, { message: 'Vehicle model is required' }),
  generation: z.string().optional(),
  yearFrom: z.number().int().min(1950).max(2100).optional(),
  yearTo: z.number().int().min(1950).max(2100).optional(),
  engineCode: z.string().optional(),
  fuel: FuelTypeSchema.optional(),
  powerKw: z.number().positive().optional(),
  powerCv: z.number().positive().optional(),
  displacementCc: z.number().int().positive().optional(),
  transmission: TransmissionTypeSchema.optional(),
  bodyType: z.string().optional(),
  doors: z.number().int().positive().optional(),
  donorVinMasked: z.string().optional(),
  donorVehicleCode: z.string().optional(),
});

export const PartConditionSchema = z.enum([
  'EXCELLENT',
  'GOOD',
  'FAIR',
  'FOR_REPAIR',
  'UNKNOWN',
]);

export const TestedStatusSchema = z.enum([
  'TESTED_WORKING',
  'NOT_TESTED',
  'TESTED_DEFECTIVE',
]);

export const PartImageSchema = z.object({
  id: z.string().min(1),
  url: z.string().url({ message: 'Image must have a valid URL' }),
  sortOrder: z.number().int().default(0),
  isPrimary: z.boolean().default(false),
  description: z.string().optional(),
});

export const InventorySourceSchema = z.object({
  providerId: z.string().min(1, { message: 'providerId is required' }),
  externalPartId: z.string().min(1, { message: 'externalPartId is required' }),
  sourceSku: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  rawPayloadHash: z.string().optional(),
  lastSeenAt: z.date().default(() => new Date()),
});

export const PartSchema = z.object({
  id: z.string().uuid({ message: 'Part ID must be a valid UUID' }),
  vendorId: z.string().min(1, { message: 'vendorId is required' }),
  source: InventorySourceSchema,
  title: z.string().min(2, { message: 'Part title must have at least 2 characters' }),
  description: z.string().optional(),
  categoryId: z.string().min(1, { message: 'categoryId is required' }),
  price: MoneySchema,
  condition: PartConditionSchema,
  testedStatus: TestedStatusSchema,
  availability: AvailabilitySchema,
  donorVehicle: VehicleSchema.optional(),
  oemReferences: z.array(OEMReferenceInputSchema),
  images: z.array(PartImageSchema),
  warrantyMonths: z.number().int().min(0).default(12),
  sourceUpdatedAt: z.date().optional(),
  lastSyncedAt: z.date().default(() => new Date()),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const VendorLocationSchema = z.object({
  city: z.string().min(1),
  province: z.string().min(1),
  postalCode: z.string().regex(/^\d{5}$/, { message: 'Spanish postal code must have 5 digits' }),
  country: z.literal('ES'),
  addressLine: z.string().optional(),
});

export const VendorContactSchema = z.object({
  publicPhone: z.string().optional(),
  publicEmail: z.string().email().optional(),
  websiteUrl: z.string().url().optional(),
});

export const VendorPoliciesSchema = z.object({
  warrantyMonths: z.number().int().min(12, {
    message: 'Spanish consumer law requires minimum 12 months warranty on used commercial goods',
  }),
  returnDays: z.number().int().min(14, {
    message: 'Distance selling regulations mandate minimum 14 days withdrawal period',
  }),
  shippingEstimateDays: z.number().int().positive().optional(),
  shippingPolicySummary: z.string().optional(),
});

export const VendorSchema = z.object({
  id: z.string().min(1),
  legalName: z.string().min(2),
  tradeName: z.string().min(2),
  catAuthorizationCode: z.string().min(3),
  catVerified: z.boolean().default(false),
  location: VendorLocationSchema,
  contact: VendorContactSchema,
  policies: VendorPoliciesSchema,
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
  averageRating: z.number().min(0).max(5).optional(),
  totalReviews: z.number().int().nonnegative().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const CatalogQueryOptionsSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().min(1).max(500).optional(),
  cursor: z.string().optional(),
  updatedAfter: z.date().optional(),
  categoryFilter: z.string().optional(),
});
