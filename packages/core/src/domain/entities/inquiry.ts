import type { Money } from './money.js';

export type InquiryStatus =
  | 'REGISTERED'
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_FAILED'
  | 'RESPONDED'
  | 'CANCELLED';

export type NotificationChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';

export type NotificationDeliveryStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED_NOT_CONFIGURED';

export interface InquiryItemSnapshot {
  readonly partId: string;
  readonly vendorId: string;
  readonly externalPartId: string;
  readonly title: string;
  readonly oemReference?: string;
  readonly price: Money;
  readonly availabilityStatus: string;
}

export interface InquiryNotificationRecord {
  readonly id: string;
  readonly inquiryId: string;
  readonly channel: NotificationChannel;
  readonly recipient: string;
  readonly status: NotificationDeliveryStatus;
  readonly provider: string;
  readonly providerMessageId?: string;
  readonly errorMessage?: string;
  readonly attemptCount: number;
  readonly sentAt?: Date;
  readonly createdAt: Date;
}

export interface CommercialInquiry {
  readonly id: string;
  readonly inquiryReference: string;
  readonly groupId: string;
  readonly vendorId: string;
  readonly customerName: string;
  readonly customerEmail?: string;
  readonly customerPhone?: string;
  readonly customerMessage?: string;
  readonly vehicleVin?: string;
  readonly vehiclePlate?: string;
  readonly privacyPolicyVersion: string;
  readonly privacyPolicyAcceptedAt: Date;
  readonly idempotencyKey: string;
  readonly status: InquiryStatus;
  readonly source: string;
  readonly items: readonly InquiryItemSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
