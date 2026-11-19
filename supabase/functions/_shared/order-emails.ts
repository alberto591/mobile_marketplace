// "Order paid" emails: one to the buyer (confirmation) and one to the seller (prepare
// and ship the parts). Called by stripe-webhook after payment_intent.succeeded.
//
// Dependency-free on purpose (no remote imports) so it runs in Deno and in unit tests.
// Sending is idempotent through the order_notifications table: a notification already
// SENT is never sent again, and a FAILED one is retried on the next webhook delivery.

export type NotificationAudience = 'BUYER' | 'SELLER';
export type NotificationStatus = 'SENT' | 'FAILED' | 'SKIPPED_NOT_CONFIGURED';

export interface OrderEmailItem {
  readonly title: string;
  readonly externalPartId: string;
  readonly unitPriceCents: number;
}

export interface PaidSuborderDetails {
  readonly suborderId: string;
  readonly orderReference: string;
  readonly suborderReference: string;
  readonly isTestOrder: boolean;
  readonly currency: string;
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly platformFeeCents: number;
  readonly sellerNetCents: number;
  readonly customer: { readonly name: string; readonly email: string; readonly phone: string };
  readonly shipping: {
    readonly line1: string;
    readonly line2: string | null;
    readonly city: string;
    readonly province: string;
    readonly postalCode: string;
    readonly country: string;
  };
  readonly vendor: { readonly tradeName: string; readonly email: string | null; readonly phone: string | null };
  readonly items: readonly OrderEmailItem[];
}

export interface OrderEmailConfig {
  readonly resendApiKey?: string;
  readonly fromEmail?: string;
  /** When true, every email goes to testRecipientEmail instead of real buyers and sellers. */
  readonly testMode: boolean;
  readonly testRecipientEmail?: string;
  /** Used when the vendor has no public email on file. */
  readonly sellerFallbackEmail?: string;
}

export interface EmailMessage {
  readonly to: string;
  readonly from: string;
  readonly subject: string;
  readonly html: string;
}

export type EmailSender = (
  message: EmailMessage
) => Promise<{ success: boolean; messageId?: string; error?: string }>;

export interface NotificationOutcome {
  readonly audience: NotificationAudience;
  readonly status: NotificationStatus | 'ALREADY_SENT';
  readonly recipient: string | null;
  readonly error?: string;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatCents(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${euros},${rest} ${currency}`;
}

const singleLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

function itemRowsHtml(order: PaidSuborderDetails): string {
  return order.items
    .map(
      (item) => `<tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><b>${escapeHtml(item.title)}</b></td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">Ref. #${escapeHtml(item.externalPartId)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatCents(item.unitPriceCents, order.currency)}</td>
      </tr>`
    )
    .join('');
}

function addressHtml(order: PaidSuborderDetails): string {
  const s = order.shipping;
  return [
    escapeHtml(s.line1),
    s.line2 ? escapeHtml(s.line2) : null,
    `${escapeHtml(s.postalCode)} ${escapeHtml(s.city)} (${escapeHtml(s.province)})`,
    escapeHtml(s.country),
  ]
    .filter(Boolean)
    .join('<br>');
}

function testBannerHtml(order: PaidSuborderDetails, config: OrderEmailConfig, intendedRecipient: string | null): string {
  if (!order.isTestOrder && !config.testMode) return '';
  const redirected = config.testMode
    ? ` Destinatario real previsto: ${escapeHtml(intendedRecipient ?? 'sin email configurado')}.`
    : '';
  return `<p style="background: #fef3c7; padding: 8px 12px; border-radius: 6px; font-size: 13px;">
    <b>PEDIDO DE PRUEBA</b> — no es una venta real, no hay que enviar ninguna pieza.${redirected}
  </p>`;
}

const tableHead = `<thead><tr style="background: #f1f5f9;">
  <th style="padding: 8px; text-align: left;">Pieza</th>
  <th style="padding: 8px; text-align: left;">Referencia</th>
  <th style="padding: 8px; text-align: right;">Precio</th>
</tr></thead>`;

export function buildSellerOrderEmail(
  order: PaidSuborderDetails,
  config: OrderEmailConfig,
  intendedRecipient: string | null
): { subject: string; html: string } {
  const prefix = order.isTestOrder || config.testMode ? '[PRUEBA] ' : '';
  const subject = singleLine(
    `${prefix}Nuevo pedido pagado ${order.suborderReference} — ${order.items.length} pieza(s) para enviar`
  );
  const html = `
  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
    ${testBannerHtml(order, config, intendedRecipient)}
    <h2 style="color: #0f172a;">Nuevo pedido pagado [${escapeHtml(order.suborderReference)}]</h2>
    <p>Un cliente ha pagado estas piezas a través de BuscaPiezas 24H. Por favor, retíralas del almacén y prepara el envío.</p>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      ${tableHead}
      <tbody>${itemRowsHtml(order)}</tbody>
    </table>

    <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <h3 style="margin-top: 0; font-size: 16px;">Enviar a:</h3>
      <p><b>${escapeHtml(order.customer.name)}</b><br>${addressHtml(order)}</p>
      <p>Teléfono: ${escapeHtml(order.customer.phone)}<br>Email: ${escapeHtml(order.customer.email)}</p>
    </div>

    <table style="font-size: 14px;">
      <tr><td style="padding: 2px 12px 2px 0;">Piezas</td><td style="text-align: right;">${formatCents(order.subtotalCents, order.currency)}</td></tr>
      <tr><td style="padding: 2px 12px 2px 0;">Envío</td><td style="text-align: right;">${formatCents(order.shippingCents, order.currency)}</td></tr>
      <tr><td style="padding: 2px 12px 2px 0;">Total cobrado al cliente</td><td style="text-align: right;">${formatCents(order.totalCents, order.currency)}</td></tr>
      <tr><td style="padding: 2px 12px 2px 0;">Comisión de la plataforma</td><td style="text-align: right;">-${formatCents(order.platformFeeCents, order.currency)}</td></tr>
      <tr><td style="padding: 2px 12px 2px 0;"><b>Importe neto para el desguace</b></td><td style="text-align: right;"><b>${formatCents(order.sellerNetCents, order.currency)}</b></td></tr>
    </table>

    <p style="font-size: 12px; color: #64748b; margin-top: 24px;">
      Pedido ${escapeHtml(order.orderReference)}. El cobro se ha realizado en tu cuenta de Stripe. Si alguna pieza no está disponible, contacta con el cliente cuanto antes.
    </p>
  </div>`;
  return { subject, html };
}

export function buildBuyerOrderEmail(
  order: PaidSuborderDetails,
  config: OrderEmailConfig,
  intendedRecipient: string | null
): { subject: string; html: string } {
  const prefix = order.isTestOrder || config.testMode ? '[PRUEBA] ' : '';
  const subject = singleLine(`${prefix}Pago confirmado — pedido ${order.orderReference}`);
  const vendorContact = [order.vendor.phone, order.vendor.email].filter(Boolean).map(escapeHtml).join(' · ');
  const html = `
  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
    ${testBannerHtml(order, config, intendedRecipient)}
    <h2 style="color: #0f172a;">Hemos recibido tu pago</h2>
    <p>Hola ${escapeHtml(order.customer.name)}, tu pedido <b>${escapeHtml(order.orderReference)}</b> está confirmado.
    <b>${escapeHtml(order.vendor.tradeName)}</b> ya ha sido avisado para preparar el envío.</p>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      ${tableHead}
      <tbody>${itemRowsHtml(order)}</tbody>
    </table>

    <table style="font-size: 14px; margin-top: 12px;">
      <tr><td style="padding: 2px 12px 2px 0;">Piezas</td><td style="text-align: right;">${formatCents(order.subtotalCents, order.currency)}</td></tr>
      <tr><td style="padding: 2px 12px 2px 0;">Envío</td><td style="text-align: right;">${formatCents(order.shippingCents, order.currency)}</td></tr>
      <tr><td style="padding: 2px 12px 2px 0;"><b>Total pagado</b></td><td style="text-align: right;"><b>${formatCents(order.totalCents, order.currency)}</b></td></tr>
    </table>

    <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <h3 style="margin-top: 0; font-size: 16px;">Dirección de entrega</h3>
      <p>${addressHtml(order)}</p>
    </div>

    <p style="font-size: 13px;">Vendedor: <b>${escapeHtml(order.vendor.tradeName)}</b>${vendorContact ? ` (${vendorContact})` : ''}.
    Puedes ver el estado del pedido en la app. Guarda este correo: incluye tu referencia de pedido.</p>
  </div>`;
  return { subject, html };
}

/** Who should receive each email, before any test-mode redirection. */
export function intendedRecipients(
  order: PaidSuborderDetails,
  config: OrderEmailConfig
): Record<NotificationAudience, string | null> {
  return {
    BUYER: order.customer.email || null,
    SELLER: order.vendor.email || config.sellerFallbackEmail || null,
  };
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

// deno-lint-ignore no-explicit-any
export function mapSuborderRow(row: any): PaidSuborderDetails {
  const o = row.orders;
  const v = row.vendors;
  return {
    suborderId: row.id,
    orderReference: o.order_reference,
    suborderReference: row.suborder_reference,
    isTestOrder: Boolean(o.is_test_order),
    currency: row.currency || 'EUR',
    subtotalCents: row.subtotal_cents,
    shippingCents: row.shipping_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    platformFeeCents: row.platform_fee_cents,
    sellerNetCents: row.seller_net_cents,
    customer: { name: o.customer_name, email: o.customer_email, phone: o.customer_phone },
    shipping: {
      line1: o.shipping_address_line1,
      line2: o.shipping_address_line2 ?? null,
      city: o.shipping_city,
      province: o.shipping_province,
      postalCode: o.shipping_postal_code,
      country: o.shipping_country,
    },
    vendor: { tradeName: v?.trade_name ?? 'Desguace', email: v?.public_email ?? null, phone: v?.public_phone ?? null },
    // deno-lint-ignore no-explicit-any
    items: (row.order_items ?? []).map((i: any) => ({
      title: i.title,
      externalPartId: i.external_part_id,
      unitPriceCents: i.unit_price_cents,
    })),
  };
}

export const SUBORDER_EMAIL_SELECT = `
  id, suborder_reference, currency, subtotal_cents, shipping_cents, tax_cents, total_cents,
  platform_fee_cents, seller_net_cents,
  orders ( order_reference, is_test_order, customer_name, customer_email, customer_phone,
           shipping_address_line1, shipping_address_line2, shipping_city, shipping_province,
           shipping_postal_code, shipping_country ),
  vendors ( trade_name, public_email, public_phone ),
  order_items ( title, external_part_id, unit_price_cents )
`;

export async function defaultResendSender(apiKey: string, message: EmailMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, html: message.html }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data?.message || `HTTP ${res.status}` };
    return { success: true, messageId: data?.id as string | undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends the buyer and seller "order paid" emails for one suborder, once each.
 * Never throws: every outcome (including failures) is recorded in order_notifications
 * and returned, so a mail problem cannot break payment processing.
 */
export async function sendOrderPaidNotifications(params: {
  supabase: SupabaseLike;
  suborderId: string;
  config: OrderEmailConfig;
  sender?: EmailSender;
}): Promise<NotificationOutcome[]> {
  const { supabase, suborderId, config } = params;
  const outcomes: NotificationOutcome[] = [];

  let order: PaidSuborderDetails;
  let alreadySent: Set<string>;
  let attempts: Map<string, number>;
  try {
    const { data: row, error } = await supabase
      .from('order_suborders')
      .select(SUBORDER_EMAIL_SELECT)
      .eq('id', suborderId)
      .single();
    if (error || !row) throw new Error(error?.message || 'subpedido no encontrado');
    order = mapSuborderRow(row);

    const { data: existing, error: existingError } = await supabase
      .from('order_notifications')
      .select('audience, status, attempt_count')
      .eq('suborder_id', suborderId)
      .eq('kind', 'ORDER_PAID');
    if (existingError) throw new Error(existingError.message);
    // deno-lint-ignore no-explicit-any
    const rows: any[] = existing ?? [];
    alreadySent = new Set(rows.filter((r) => r.status === 'SENT').map((r) => r.audience));
    attempts = new Map(rows.map((r) => [r.audience, r.attempt_count ?? 0]));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (['BUYER', 'SELLER'] as const).map((audience) => ({
      audience,
      status: 'FAILED' as const,
      recipient: null,
      error: `No se pudieron preparar los avisos: ${message}`,
    }));
  }

  const intended = intendedRecipients(order, config);
  const sender: EmailSender | null =
    params.sender ?? (config.resendApiKey ? (m) => defaultResendSender(config.resendApiKey!, m) : null);

  for (const audience of ['SELLER', 'BUYER'] as const) {
    if (alreadySent.has(audience)) {
      outcomes.push({ audience, status: 'ALREADY_SENT', recipient: null });
      continue;
    }

    const recipient = config.testMode ? config.testRecipientEmail || null : intended[audience];
    let status: NotificationStatus;
    let messageId: string | undefined;
    let error: string | undefined;

    if (!sender || !config.fromEmail || !recipient) {
      status = 'SKIPPED_NOT_CONFIGURED';
      error = !sender
        ? 'RESEND_API_KEY no configurado'
        : !config.fromEmail
        ? 'Remitente no configurado (ORDER_FROM_EMAIL / INQUIRY_FROM_EMAIL)'
        : config.testMode
        ? 'Destinatario de prueba no configurado (ORDER_TEST_RECIPIENT_EMAIL)'
        : audience === 'SELLER'
        ? 'El desguace no tiene email público ni hay ORDER_SELLER_FALLBACK_EMAIL'
        : 'El pedido no tiene email de cliente';
    } else {
      const content =
        audience === 'SELLER'
          ? buildSellerOrderEmail(order, config, intended.SELLER)
          : buildBuyerOrderEmail(order, config, intended.BUYER);
      let result: Awaited<ReturnType<EmailSender>>;
      try {
        result = await sender({ to: recipient, from: config.fromEmail, ...content });
      } catch (err) {
        result = { success: false, error: err instanceof Error ? err.message : String(err) };
      }
      status = result.success ? 'SENT' : 'FAILED';
      messageId = result.messageId;
      error = result.success ? undefined : result.error || 'Error desconocido del proveedor de email';
    }

    const now = new Date().toISOString();
    try {
      await supabase.from('order_notifications').upsert(
        {
          suborder_id: suborderId,
          kind: 'ORDER_PAID',
          audience,
          recipient,
          status,
          provider_message_id: messageId ?? null,
          error_message: error ?? null,
          attempt_count: (attempts.get(audience) ?? 0) + (status === 'SKIPPED_NOT_CONFIGURED' ? 0 : 1),
          last_attempted_at: now,
          sent_at: status === 'SENT' ? now : null,
        },
        { onConflict: 'suborder_id,kind,audience' }
      );
    } catch {
      // The email outcome stands even if the log row could not be written.
    }

    outcomes.push({ audience, status, recipient, error });
  }

  return outcomes;
}
