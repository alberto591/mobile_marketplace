export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
  readonly received?: unknown;
}

export class NormalizationError extends Error {
  readonly providerId: string;
  readonly externalPartId: string;
  readonly issues: readonly ValidationIssue[];

  constructor(params: {
    providerId: string;
    externalPartId: string;
    message: string;
    issues?: readonly ValidationIssue[];
  }) {
    super(`[NormalizationError] ${params.providerId} part #${params.externalPartId}: ${params.message}`);
    this.name = 'NormalizationError';
    this.providerId = params.providerId;
    this.externalPartId = params.externalPartId;
    this.issues = params.issues ?? [];
  }
}

export class ProviderApiError extends Error {
  readonly providerId: string;
  readonly statusCode?: number;
  readonly isRetryable: boolean;

  constructor(params: {
    providerId: string;
    message: string;
    statusCode?: number;
    isRetryable?: boolean;
    cause?: Error;
  }) {
    super(`[ProviderApiError] ${params.providerId}: ${params.message}`);
    this.name = 'ProviderApiError';
    this.providerId = params.providerId;
    this.statusCode = params.statusCode;
    this.isRetryable = params.isRetryable ?? false;
    if (params.cause) {
      this.cause = params.cause;
    }
  }
}
