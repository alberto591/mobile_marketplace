export type OrderIssueType =
  | 'DEFECTIVE_PART'
  | 'WRONG_OR_INCOMPATIBLE'
  | 'SHIPPING_DAMAGE'
  | 'WITHDRAWAL_14D'
  | 'NOT_RECEIVED'
  | 'OTHER';

export interface OrderIssueOption {
  readonly type: OrderIssueType;
  readonly label: string;
  readonly helper: string;
}

export const ORDER_ISSUE_OPTIONS: readonly OrderIssueOption[] = [
  {
    type: 'DEFECTIVE_PART',
    label: 'Pieza defectuosa o no funciona',
    helper: 'El recambio tiene un fallo eléctrico, mecánico o no corresponde al estado descrito.',
  },
  {
    type: 'WRONG_OR_INCOMPATIBLE',
    label: 'Pieza equivocada o no compatible',
    helper: 'Has recibido otra pieza o la referencia no encaja en tu vehículo.',
  },
  {
    type: 'SHIPPING_DAMAGE',
    label: 'Daño durante el transporte',
    helper: 'El paquete o la pieza llegó roto o golpeado por la mensajería.',
  },
  {
    type: 'WITHDRAWAL_14D',
    label: 'Solicitar devolución (14 días)',
    helper: 'Desistimiento legal dentro de los 14 días naturales desde la entrega.',
  },
  {
    type: 'NOT_RECEIVED',
    label: 'Pedido no recibido / retraso',
    helper: 'El envío lleva retraso o el seguimiento no avanza.',
  },
] as const;

export interface ReportOrderIssuePayload {
  readonly accessToken: string;
  readonly issueType: OrderIssueType;
  readonly description: string;
  readonly contactPhone?: string;
}

export interface ReportOrderIssueResponse {
  readonly success: boolean;
  readonly issueId: string;
  readonly status: string;
}

export class OrderIssueError extends Error {
  readonly code?: string;
  readonly statusCode?: number;

  constructor(message: string, opts?: { code?: string; statusCode?: number }) {
    super(message);
    this.name = 'OrderIssueError';
    this.code = opts?.code;
    this.statusCode = opts?.statusCode;
  }
}

export interface OrderIssueServiceOptions {
  readonly baseUrl?: string;
  readonly anonKey?: string;
  readonly fetchFn?: typeof fetch;
}

export class OrderIssueService {
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: OrderIssueServiceOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      'http://127.0.0.1:54321'
    ).replace(/\/+$/, '');
    this.anonKey =
      options.anonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'mock-anon-key-local';
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  async reportIssue(payload: ReportOrderIssuePayload): Promise<ReportOrderIssueResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/functions/v1/report-order-issue`, {
      method: 'POST',
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.anonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      throw new OrderIssueError(
        data?.message || `No se pudo registrar la incidencia (HTTP ${res.status}).`,
        { code: data?.error, statusCode: res.status }
      );
    }

    return {
      success: true,
      issueId: String(data.issueId),
      status: String(data.status || 'OPEN'),
    };
  }
}

export const orderIssueService = new OrderIssueService();
