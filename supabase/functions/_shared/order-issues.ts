// Shared handler for buyer order issue / return requests (`report-order-issue`).
// Authenticated via the guest order's non-guessable `access_token`.

import { defaultResendSender, type EmailSender } from './order-emails.ts';

export const ALLOWED_ISSUE_TYPES = [
  'DEFECTIVE_PART',
  'WRONG_OR_INCOMPATIBLE',
  'SHIPPING_DAMAGE',
  'WITHDRAWAL_14D',
  'NOT_RECEIVED',
  'OTHER',
] as const;

export type OrderIssueType = (typeof ALLOWED_ISSUE_TYPES)[number];

export const ISSUE_TYPE_LABELS: Record<OrderIssueType, string> = {
  DEFECTIVE_PART: 'Pieza defectuosa o no funciona',
  WRONG_OR_INCOMPATIBLE: 'Pieza equivocada o no compatible',
  SHIPPING_DAMAGE: 'Daño durante el transporte',
  WITHDRAWAL_14D: 'Desistimiento (14 días naturales)',
  NOT_RECEIVED: 'Pedido no recibido / incidencia con envío',
  OTHER: 'Otra incidencia',
};

export interface OrderIssueEmailConfig {
  readonly resendApiKey?: string;
  readonly fromEmail?: string;
  readonly opsAlertEmail?: string;
}

export interface OrderIssueResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function handleReportOrderIssue(params: {
  readonly supabase: SupabaseLike;
  readonly payload: unknown;
  readonly emailConfig: OrderIssueEmailConfig;
  readonly sender?: EmailSender;
}): Promise<OrderIssueResult> {
  const { supabase, emailConfig } = params;
  // deno-lint-ignore no-explicit-any
  const body = (params.payload ?? {}) as any;

  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
  const issueType = typeof body.issueType === 'string' ? body.issueType.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const contactPhone = typeof body.contactPhone === 'string' ? body.contactPhone.trim().slice(0, 40) : null;

  if (accessToken.length < 16) {
    return { status: 400, body: { success: false, error: 'INVALID_TOKEN', message: 'Token de pedido no válido.' } };
  }
  if (!ALLOWED_ISSUE_TYPES.includes(issueType as OrderIssueType)) {
    return { status: 400, body: { success: false, error: 'INVALID_ISSUE_TYPE', message: 'Selecciona un motivo válido.' } };
  }
  if (description.length < 10 || description.length > 2000) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'INVALID_DESCRIPTION',
        message: 'Describe brevemente el problema (entre 10 y 2000 caracteres).',
      },
    };
  }

  // Look up order by access_token
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(
      `id, order_reference, status, customer_name, customer_email, customer_phone, is_test_order,
       order_suborders (
         id, suborder_reference, fulfillment_status, shipping_carrier, tracking_number,
         vendors ( trade_name, public_email, public_phone ),
         order_items ( title, external_part_id, unit_price_cents )
       )`
    )
    .eq('access_token', accessToken)
    .maybeSingle();

  if (orderErr) {
    return { status: 500, body: { success: false, error: 'DB_ERROR', message: 'Error consultando el pedido.' } };
  }
  if (!order) {
    return { status: 404, body: { success: false, error: 'ORDER_NOT_FOUND', message: 'Pedido no encontrado.' } };
  }

  // Prevent duplicate spam: max 3 open issues per order
  const { data: existingIssues } = await supabase
    .from('order_issues')
    .select('id')
    .eq('order_id', order.id)
    .in('status', ['OPEN', 'IN_REVIEW']);

  if (Array.isArray(existingIssues) && existingIssues.length >= 3) {
    return {
      status: 409,
      body: {
        success: false,
        error: 'TOO_MANY_OPEN_ISSUES',
        message: 'Ya tienes incidencias abiertas para este pedido. Nuestro equipo de soporte las está revisando.',
      },
    };
  }

  // deno-lint-ignore no-explicit-any
  const primarySuborder = Array.isArray(order.order_suborders) ? (order.order_suborders[0] as any) : null;

  const { data: created, error: insertErr } = await supabase
    .from('order_issues')
    .insert({
      order_id: order.id,
      suborder_id: primarySuborder?.id ?? null,
      issue_type: issueType,
      description,
      contact_phone: contactPhone || order.customer_phone || null,
      status: 'OPEN',
    })
    .select('id, status, created_at')
    .single();

  if (insertErr || !created) {
    return { status: 500, body: { success: false, error: 'DB_ERROR', message: 'No se pudo registrar la incidencia.' } };
  }

  // Best-effort ops email alert (never fails the ticket creation)
  let opsNotified: 'SENT' | 'FAILED' | 'SKIPPED_NOT_CONFIGURED' = 'SKIPPED_NOT_CONFIGURED';
  const sender =
    params.sender ?? (emailConfig.resendApiKey ? (m) => defaultResendSender(emailConfig.resendApiKey!, m) : null);

  if (sender && emailConfig.fromEmail && emailConfig.opsAlertEmail) {
    const label = ISSUE_TYPE_LABELS[issueType as OrderIssueType];
    const testPrefix = order.is_test_order ? '[PRUEBA] ' : '';
    const vendorName = primarySuborder?.vendors?.trade_name ?? 'Desguace';
    // deno-lint-ignore no-explicit-any
    const itemsList = (primarySuborder?.order_items ?? []).map((i: any) => `${i.title} (ref ${i.external_part_id ?? '-'})`);

    const subject = `${testPrefix}Incidencia / devolución en ${order.order_reference} — ${label}`;
    const text = [
      `Nueva incidencia registrada (${created.id})`,
      `Pedido: ${order.order_reference} (estado: ${order.status})`,
      `Motivo: ${label} (${issueType})`,
      `Desguace: ${vendorName}`,
      `Piezas: ${itemsList.join(', ') || '-'}`,
      `Comprador: ${order.customer_name} · ${order.customer_email} · ${contactPhone || order.customer_phone || '-'}`,
      primarySuborder?.tracking_number
        ? `Envío: ${primarySuborder.shipping_carrier ?? '-'} / ${primarySuborder.tracking_number}`
        : null,
      '',
      'Descripción del comprador:',
      description,
    ]
      .filter((line) => line !== null)
      .join('\n');

    const html = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.5">${escapeHtml(text)}</pre>`;

    try {
      const res = await sender({
        to: emailConfig.opsAlertEmail,
        from: emailConfig.fromEmail,
        subject,
        text,
        html,
      });
      opsNotified = res.success ? 'SENT' : 'FAILED';
      if (res.success) {
        await supabase
          .from('order_issues')
          .update({ ops_notified_at: new Date().toISOString() })
          .eq('id', created.id);
      }
    } catch {
      opsNotified = 'FAILED';
    }
  }

  return {
    status: 201,
    body: {
      success: true,
      issueId: created.id,
      status: created.status,
      opsNotified,
    },
  };
}
