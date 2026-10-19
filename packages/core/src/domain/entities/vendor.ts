/**
 * Vendor Entity (Centro Autorizado de Tratamiento - CAT / Desguace Profesional).
 * Encapsulates public commercial information and regulatory compliance (RD 265/2021).
 */
export interface VendorLocation {
  readonly city: string;
  readonly province: string;
  readonly postalCode: string;
  readonly country: 'ES';
  readonly addressLine?: string;
}

export interface VendorContact {
  readonly publicPhone?: string;
  readonly publicEmail?: string;
  readonly websiteUrl?: string;
}

export interface VendorPolicies {
  readonly warrantyMonths: number;
  readonly returnDays: number;
  readonly shippingEstimateDays?: number;
  readonly shippingPolicySummary?: string;
}

export type VendorStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface Vendor {
  readonly id: string;
  readonly legalName: string;
  readonly tradeName: string;
  readonly catAuthorizationCode: string;
  readonly catVerified: boolean;
  readonly location: VendorLocation;
  readonly contact: VendorContact;
  readonly policies: VendorPolicies;
  readonly status: VendorStatus;
  readonly averageRating?: number;
  readonly totalReviews?: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function isVendorEligibleForSales(vendor: Vendor): boolean {
  return vendor.status === 'ACTIVE' && vendor.catVerified;
}

/**
 * Evaluates whether a vendor's policies satisfy general B2C consumer law requirements
 * (minimum 12 months warranty for used commercial goods and 14 days distance withdrawal).
 * Note: Professional / B2B sales or counter sales may legitimately operate under distinct terms.
 */
export function isVendorConsumerCompliant(policies: VendorPolicies): boolean {
  return policies.warrantyMonths >= 12 && policies.returnDays >= 14;
}
