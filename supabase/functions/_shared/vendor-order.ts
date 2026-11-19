// Seller order page backend: read one paid suborder and mark it as shipped, authorised by
// the suborder's action token (sent to the seller in the "order paid" email).
// Dependency-free: the Edge Function passes in a supabase client and the email settings.

import {
  defaultResendSender,
  escapeHtml,
  type EmailSender,
  type OrderEmailConfig,
} from './order-emails.ts';

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface VendorOrderResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const CARRIER_PATTERN = /^[\p{L}\p{N} .,&'()/+-]{2,80}$/u;
const TRACKING_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ./_-]{2,119}$/;

const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): VendorOrderResult => ({
  status,
  body: { success: false, error, message, ...extra },
});

const INVALID_LINK = fail(
  404,
  'INVALID_LINK',
  'Este enlace no es válido o el pedido todavía no está pagado. Usa el enlace del email de pedido más reciente.'
);

export function buildShippedEmail(
  order: {
    orderReference: string;
    isTestOrder: boolean;
    vendorTradeName: string;
    customerName: string;
    carrier: string;
    trackingNumber: string;
    items: readonly { title: string; externalPartId: string }[];
  },
  config: OrderEmailConfig,
  intendedRecipient: string | null
): { subject: string; html: string } {
  const test = order.isTestOrder || config.testMode;
  const subject = `${test ? '[PRUEBA] ' : ''}Tu pedido ${order.orderReference} está en camino`.replace(/[\r\n]+/g, ' ');
  const banner = test
    ? `<p style="background: #fef3c7; padding: 8px 12px; border-radius: 6px; font-size: 13px;"><b>PEDIDO DE PRUEBA</b> — no es un envío real.${
        config.testMode ? ` Destinatario real previsto: ${escapeHtml(intendedRecipient ?? 'sin email')}.` : ''
      }</p>`
    : '';
  const items = order.items
    .map((i) => `<li>${escapeHtml(i.title)} <span style="color: #64748b;">(Ref. #${escapeHtml(i.externalPartId)})</span></li>`)
    .join('');
  const html = `
  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
    ${banner}
    <h2 style="color: #0f172a;">Tu pedido está en camino</h2>
    <p>Hola ${escapeHtml(order.customerName)}, <b>${escapeHtml(order.vendorTradeName)}</b> ha enviado tu pedido
    <b>${escapeHtml(order.orderReference)}</b>.</p>
    <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <p style="margin: 0;"><b>Transportista:</b> ${escapeHtml(order.carrier)}<br>
      <b>Número de seguimiento:</b> ${escapeHtml(order.trackingNumber)}</p>
    </div>
    <ul>${items}</ul>
    <p style="font-size: 13px;">Puedes seguir el estado del pedido en la app. Al recibirlo, comprueba la pieza antes de montarla.</p>
  </div>`;
  return { subject, html };
}

/** Sends the "shipped" email to the buyer once per suborder. Never throws. */
async function notifyBuyerShipped(params: {
  supabase: SupabaseLike;
  suborderId: string;
  config: OrderEmailConfig;
  sender?: EmailSender;
}): Promise<'SENT' | 'FAILED' | 'SKIPPED_NOT_CONFIGURED' | 'ALREADY_SENT'> {
  const { supabase, suborderId, config } = params;
  try {
    const { data: existing } = await supabase
      .from('order_notifications')
      .select('status, attempt_count')
      .eq('suborder_id', suborderId)
      .eq('kind', 'ORDER_SHIPPED');
    // deno-lint-ignore no-explicit-any
    const rows: any[] = existing ?? [];
    if (rows.some((r) => r.status === 'SENT')) return 'ALREADY_SENT';
    const attempts = rows[0]?.attempt_count ?? 0;

    const { data: row, error } = await supabase
      .from('order_suborders')
      .select(
        `shipping_carrier, tracking_number,
         orders ( order_reference, is_test_order, customer_name, customer_email ),
         vendors ( trade_name ),
         order_items ( title, external_part_id )`
      )
      .eq('id', suborderId)
      .single();
    if (error || !row) throw new Error(error?.message || 'subpedido no encontrado');

    const intended: string | null = row.orders.customer_email || null;
    const recipient = config.testMode ? config.testRecipientEmail || null : intended;
    const sender: EmailSender | null =
      params.sender ?? (config.resendApiKey ? (m) => defaultResendSender(config.resendApiKey!, m) : null);

    let status: 'SENT' | 'FAILED' | 'SKIPPED_NOT_CONFIGURED';
    let messageId: string | undefined;
    let errorMessage: string | undefined;

    if (!sender || !config.fromEmail || !recipient) {
      status = 'SKIPPED_NOT_CONFIGURED';
      errorMessage = 'Email no configurado (RESEND_API_KEY, remitente o destinatario)';
    } else {
      const content = buildShippedEmail(
        {
          orderReference: row.orders.order_reference,
          isTestOrder: Boolean(row.orders.is_test_order),
          vendorTradeName: row.vendors?.trade_name ?? 'El desguace',
          customerName: row.orders.customer_name,
          carrier: row.shipping_carrier,
          trackingNumber: row.tracking_number,
          // deno-lint-ignore no-explicit-any
          items: (row.order_items ?? []).map((i: any) => ({ title: i.title, externalPartId: i.external_part_id })),
        },
        config,
        intended
      );
      let result: Awaited<ReturnType<EmailSender>>;
      try {
        result = await sender({ to: recipient, from: config.fromEmail, ...content });
      } catch (err) {
        result = { success: false, error: err instanceof Error ? err.message : String(err) };
      }
      status = result.success ? 'SENT' : 'FAILED';
      messageId = result.messageId;
      errorMessage = result.success ? undefined : result.error || 'Error desconocido del proveedor de email';
    }

    const now = new Date().toISOString();
    await supabase.from('order_notifications').upsert(
      {
        suborder_id: suborderId,
        kind: 'ORDER_SHIPPED',
        audience: 'BUYER',
        recipient,
        status,
        provider_message_id: messageId ?? null,
        error_message: errorMessage ?? null,
        attempt_count: attempts + (status === 'SKIPPED_NOT_CONFIGURED' ? 0 : 1),
        last_attempted_at: now,
        sent_at: status === 'SENT' ? now : null,
      },
      { onConflict: 'suborder_id,kind,audience' }
    );
    return status;
  } catch {
    return 'FAILED';
  }
}

/**
 * Handles one request from the seller page.
 *   { token, action: 'get' }
 *   { token, action: 'ship', carrier, trackingNumber }
 * The token travels in the request body, never in the URL.
 */
export async function handleVendorOrderRequest(params: {
  supabase: SupabaseLike;
  payload: unknown;
  emailConfig: OrderEmailConfig;
  sender?: EmailSender;
}): Promise<VendorOrderResult> {
  const { supabase, emailConfig } = params;
  // deno-lint-ignore no-explicit-any
  const payload = (params.payload ?? {}) as any;

  const token = typeof payload.token === 'string' ? payload.token.trim().toLowerCase() : '';
  if (!TOKEN_PATTERN.test(token)) return INVALID_LINK;

  const action = payload.action === 'ship' ? 'ship' : payload.action === 'get' || payload.action === undefined ? 'get' : null;
  if (!action) return fail(400, 'INVALID_ACTION', 'Acción no reconocida.');

  let shipmentEmail: string | undefined;

  if (action === 'ship') {
    const carrier = typeof payload.carrier === 'string' ? payload.carrier.trim() : '';
    const trackingNumber = typeof payload.trackingNumber === 'string' ? payload.trackingNumber.trim() : '';
    if (!CARRIER_PATTERN.test(carrier)) {
      return fail(400, 'INVALID_CARRIER', 'Indica el transportista (entre 2 y 80 caracteres).');
    }
    if (!TRACKING_PATTERN.test(trackingNumber)) {
      return fail(400, 'INVALID_TRACKING', 'Indica un número de seguimiento válido (letras, números y guiones).');
    }

    const { data, error } = await supabase.rpc('vendor_mark_suborder_shipped', {
      p_token: token,
      p_carrier: carrier,
      p_tracking_number: trackingNumber,
    });
    if (error) return fail(500, 'DB_ERROR', 'No se pudo guardar el envío. Inténtalo de nuevo.');

    if (!data?.ok) {
      switch (data?.error) {
        case 'NOT_FOUND':
          return INVALID_LINK;
        case 'NOT_PAID':
          return fail(409, 'NOT_PAID', 'Este pedido no está pagado (o ha sido reembolsado): no hay que enviarlo.');
        case 'NOT_SHIPPABLE':
          return fail(409, 'NOT_SHIPPABLE', 'Este pedido ya no admite cambios de envío.', {
            fulfillmentStatus: data.fulfillmentStatus,
          });
        default:
          return fail(400, 'INVALID_SHIPPING_DATA', 'Los datos de envío no son válidos.');
      }
    }

    // The buyer is emailed on the first shipment only; later tracking corrections just update the page.
    if (data.firstShipment) {
      shipmentEmail = await notifyBuyerShipped({
        supabase,
        suborderId: data.suborderId,
        config: emailConfig,
        sender: params.sender,
      });
    }
  }

  const { data: order, error: readError } = await supabase.rpc('vendor_get_suborder', { p_token: token });
  if (readError) return fail(500, 'DB_ERROR', 'No se pudo cargar el pedido. Inténtalo de nuevo.');
  if (!order) return INVALID_LINK;

  return {
    status: 200,
    body: { success: true, order, ...(shipmentEmail ? { buyerNotification: shipmentEmail } : {}) },
  };
}
