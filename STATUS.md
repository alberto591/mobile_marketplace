# Estado del Proyecto: BuscaPiezas 24H (Marketplace de Recambios de Desguace)

- **Fecha de actualización:** 2026-11-19
- **Fase actual:** Piloto operativo en web (Vercel) + backend Supabase con catálogo completo de Eurodesguace Málaga, envío por peso, portal del desguace, textos legales y medición de uso
- **Web publicada:** https://buscapiezas24h.vercel.app (desplegada desde `apps/mobile/dist` con rewrites SPA en `apps/mobile/vercel.json`)
- **Estado de pruebas:** 270 pruebas unitarias pasando al 100 % (155 en `@mobile-marketplace/core` en 19 archivos, 115 en `@mobile-marketplace/mobile` en 18 archivos) + 8 pruebas opt-in contra backend en vivo (`npm run test:live`)
- **Tipado estático:** TypeScript estricto (`npm run typecheck`) y `deno check` en las 6 Edge Functions superados con 0 errores
- **Stack cliente:** Expo SDK 58 (`~58.0.26`) / React Native `0.88.1` / React `19.3.0` / `@stripe/stripe-react-native` `0.81.0`
- **Proyecto Supabase:** `lmsjgxhzfksyrlxyqndd` (West Europe - Ireland)
- **Catálogo sincronizado:** Eurodesguace Málaga completo — `36.771` piezas totales en `parts`, `31.873` activas en `public_catalog_parts` (`31.870` con `weight_grams`, 99,99 % de cobertura para cálculo automático de envío)
- **Edge Functions desplegadas (6):** `eurodesguace-sync`, `image-proxy`, `submit-inquiry`, `create-payment-intent`, `stripe-webhook`, `vendor-order`
- **Proveedor de pagos:** Stripe Connect (Direct Charges en cuenta conectada del desguace con comisión del 10 % sobre el subtotal de piezas mediante `application_fee_amount`)
- **Repositorio GitHub:** https://github.com/alberto591/mobile_marketplace (rama `main`)

---

## 1. Resumen Ejecutivo del Estado

### 1.1. Catálogo y Sincronización
- **Sincronización completa ejecutada (2026-11-19):** pasada íntegra por el catálogo de Eurodesguace Málaga mediante `eurodesguace-sync?action=sync-batch&limit=50` (`732` lotes sin errores, cursor reiniciado a `null`).
- **Peso por pieza (`20261119000008_part_weight_for_shipping.sql`):** cada pieza almacena `weight_grams` (parseado desde el campo `peso` del proveedor) y se expone en `public_catalog_parts`. Las piezas sin precio utilizable pasan automáticamente a consulta comercial (`20261119000006_unpriced_parts_to_inquiry.sql`).
- **Automatización:** `.github/workflows/sync-catalog.yml` recorre el catálogo cada 6 horas retomando el cursor almacenado en `source_integrations`.
- **Car Center (VextCentral):** documentado en [car-center-vextcentral-api.md](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/providers/car-center-vextcentral-api.md); a la espera de URL base y contrato oficial del canal para implementar el adaptador real.

### 1.2. Checkout, Envíos y Operación de Pedidos
- **Envío por peso y zona postal:** cálculo determinista en `packages/core/src/domain/entities/shipping.ts` y `supabase/functions/_shared/shipping.ts` según tabla `TABLA PORTES GENERAL` (península, Baleares, etc., hasta 250 kg). Si una pieza no tiene peso o el destino/peso no admite tarifa automática, el checkout deriva honestamente a consulta comercial en lugar de estimar un porte.
- **Impuestos y comisión:** régimen general de IVA del 21 % (`GENERAL_21`) sobre piezas + envío; comisión de plataforma del 10 % exclusivamente sobre el subtotal de piezas.
- **Reservas atómicas (`20261119000000_part_reservations.sql`):** reserva temporal de stock por pedido para evitar sobreventa concurrente y baja definitiva al confirmarse el pago (`mark_order_parts_sold`).
- **Seguimiento y portal del desguace:**
  - Comprador: historial local «Mis pedidos» (`apps/mobile/app/orders.tsx`) y enlace compartible de pedido (`apps/mobile/app/order/[reference].tsx`) con token en fragmento `#token=` en web.
  - Vendedor (CAT): portal autenticado por token de subpedido (`apps/mobile/app/vendor/order.tsx` + Edge Function `vendor-order` + migración `20261119000005_vendor_order_actions.sql`) para confirmar preparación, registrar transportista y número de seguimiento, y notificar al comprador una sola vez.
- **Notificaciones (`20261119000003_order_notifications.sql`):** outbox idempotente de correos al comprador y al vendedor tras pago confirmado (`stripe-webhook` + `_shared/order-emails.ts`).

### 1.3. Seguridad, Privacidad y Textos Legales
- **Rate limit compartido (`20261119000007_shared_rate_limit.sql`):** contador atómico en PostgreSQL (`rate_limit_counters` / `check_rate_limit`) compartido entre todas las instancias de Edge Functions (`submit-inquiry`, `create-payment-intent`, `vendor-order`, `record_client_event`), almacenando solo el hash SHA-256 de la clave.
- **Mínimo privilegio en BD (`20261119000002_public_column_grants.sql`):** `anon` y `authenticated` solo leen columnas públicas explícitas; todas las mutaciones críticas pasan por `service_role` o RPCs validadas.
- **Páginas legales (`apps/mobile/content/legal.ts`, `apps/mobile/app/legal/`):** Aviso legal (incluye punto de contacto DSA), Política de privacidad, Condiciones de compra y Política de devoluciones/garantía.

### 1.4. Medición de Uso y Embudo de Producto (`20261119000009_usage_analytics.sql`)
- **Eventos registrados en `product_events` (sin PII ni cookies de terceros):**
  - `search`: todas las búsquedas desde `apps/mobile/app/results.tsx` con `query_text`, filtros y `result_count` (identificando búsquedas con `result_count = 0`).
  - `part_click`: clics sobre fichas en resultados de búsqueda con `part_id`, `vendor_id`, posición y contexto de búsqueda.
  - `inquiry_submitted`: registrado en servidor desde `submit-inquiry` al persistir cada consulta comercial.
  - `checkout_started`: registrado en servidor desde `create-payment-intent` al crear el pedido y vincular el PaymentIntent.
  - `purchase_completed`: registrado en servidor desde `stripe-webhook` de forma idempotente en la primera transición a `SUCCEEDED` (incluye `amount_cents` para GMV).
- **Seguridad:** acceso directo a `product_events` restringido a `service_role`; el cliente solo puede invocar la RPC `record_client_event` (limitada a `search` y `part_click`, validada y protegida con `check_rate_limit`).
- **Vistas de consulta (`service_role`):**
  - `usage_funnel_daily`: embudo diario (`searches`, `searches_zero_results`, `zero_result_rate_pct`, `part_clicks`, `search_ctr_pct`, `inquiries`, `checkouts_started`, `purchases_completed`, `gmv_cents`).
  - `usage_zero_result_queries`: top búsquedas sin resultados en los últimos 30 días.

---

## 2. Cobertura de Pruebas Automatizadas

Ejecución verificada con Vitest (`npm test`): **270 pruebas unitarias pasando (100 %)** + **8 pruebas live opt-in**.

### `@mobile-marketplace/core` (19 archivos, 155 pruebas)
| Archivo | Pruebas | Cobertura |
|---|---|---|
| `commercial-inquiries.test.ts` | 18 | Consultas comerciales, consentimiento, idempotencia, rate limiting |
| `image-proxy-security.test.ts` | 18 | Hardening SSRF, lista blanca, redirecciones, timeouts, MIME |
| `eurodesguace-adapter.test.ts` | 11 | Parsing decimal, Zod, 429 Retry-After, cursor, confidencialidad |
| `order-paid-emails.test.ts` | 11 | Correos de pedido pagado a comprador/vendedor e idempotencia |
| `mock-adapters.test.ts` | 10 | Paginación, stock y errores 404 |
| `shipping.test.ts` | 10 | Tarifas por peso y zona postal, IVA 21 %, exclusiones |
| `transactional-checkout.test.ts` | 10 | Precios confiables, comisión 10 %, esquemas Zod de checkout |
| `eurodesguace-sync-persistence.test.ts` | 8 | Normalización e ingesta por lotes con peso y bajas |
| `money.test.ts` | 8 | Céntimos enteros, parsing decimal y operaciones seguras |
| `sync-edge-function-security.test.ts` | 7 | Autorización `sync-batch`, clamp a 50 piezas, acciones admin |
| `compatibility-signal.test.ts` | 6 | OEM oficial frente a referencia visual del CAT |
| `eurodesguace-sync-engine.test.ts` | 6 | Idempotencia, cursor, bajas lógicas y límite de lote |
| `vendor-order.test.ts` | 6 | Portal del vendedor: validaciones, envío, tracking y correos |
| `oem-normalization.test.ts` | 5 | Normalización de referencias OEM |
| `rate-limit.test.ts` | 5 | Ventanas locales y contador compartido |
| `duplicate-and-traceability.test.ts` | 3 | Aislamiento de origen y trazabilidad multi-desguace |
| `product-events.test.ts` | 3 | Serialización e inserción fail-safe de eventos de servidor |
| `validation-and-errors.test.ts` | 3 | Esquemas Zod y normativas CAT |
| `vextcentral-contract.test.ts` | 2 | Esquema borrador para VextCentral |

### `@mobile-marketplace/mobile` (18 archivos activos, 115 pruebas + 1 archivo live opt-in, 8 pruebas)
| Archivo | Pruebas | Cobertura |
|---|---|---|
| `catalog-service.test.ts` | 12 | Agregación multi-proveedor, filtros y referencias visuales |
| `backend-catalog-service.test.ts` | 11 | PostgREST, `search_catalog`, peso, Fail Fast y proxy de imágenes |
| `cart-service.test.ts` | 9 | Carrito, cantidad 1, agrupación por desguace y persistencia |
| `whatsapp-contact.test.ts` | 9 | Normalización +34, mensaje honesto y apertura de WhatsApp |
| `favourites.test.ts` | 8 | Persistencia de favoritos, deduplicación y tolerancia a fallos |
| `garage.test.ts` | 8 | Mi Garaje, serialización y filtro por vehículo donante |
| `savings-comparison.test.ts` | 8 | Ahorro seguro frente a PVP y rigor en datos |
| `pending-orders-and-cart-hardening.test.ts` | 7 | Protección de carrito y pedidos pendientes |
| `checkout-attempt.test.ts` | 6 | Reintentos idempotentes de checkout |
| `category-grid.test.ts` | 5 | Agrupación visual de categorías |
| `share-part.test.ts` | 5 | Compartir pieza con mecánico/cliente |
| `analytics-service.test.ts` | 4 | Eventos `search`, cero resultados, `part_click` y tolerancia a fallos |
| `cat-trust.test.ts` | 4 | Verificación CAT, garantías y enlaces oficiales |
| `legal-content.test.ts` | 4 | Integridad de textos legales y detección de datos pendientes |
| `order-history-and-status.test.ts` | 4 | Historial «Mis pedidos» y estados |
| `order-link.test.ts` | 4 | Enlace compartible con token en `#fragment` en web |
| `vendor-order-service.test.ts` | 4 | Cliente del portal del vendedor |
| `checkout-service.test.ts` | 3 | Creación de PaymentIntent y consulta de pedido por token |
| `live-backend-integration.test.ts` | 8 (opt-in) | Flujos contra backend Supabase real (`npm run test:live`) |

---

## 3. Comandos de Verificación y Despliegue

```bash
# 1. Comprobar tipado y suite completa
npm run typecheck
npm test

# 2. Comprobar Edge Functions con Deno
deno check supabase/functions/{create-payment-intent,stripe-webhook,eurodesguace-sync,vendor-order,submit-inquiry,image-proxy}/index.ts

# 3. Verificar salud de Supabase en producción
python3 scripts/check_supabase_production.py

# 4. Exportar web y publicar en Vercel
cd apps/mobile && EXPO_NO_TELEMETRY=1 npx expo export --platform web
vercel deploy --prod --yes --cwd apps/mobile/dist
```

---

## 4. Pendientes Operativos Antes de Tráfico Real

1. **Datos del titular en textos legales:** completar `taxId` (NIF) y `address` (domicilio) en `OPERATOR` dentro de [legal.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/content/legal.ts) (actualmente marcados como `[pendiente de completar]`).
2. **Correos en modo real:** configurar en Supabase `RESEND_API_KEY`, `INQUIRY_FROM_EMAIL`, `ORDER_FROM_EMAIL`, `EURODESGUACE_INQUIRY_EMAIL`, `VENDOR_PORTAL_BASE_URL` y activar `ORDER_EMAIL_TEST_MODE=false` cuando se pase a producción comercial.
3. **Stripe en modo real:** pasar de claves de test a claves live cuando la fiscalidad y la cuenta conectada del desguace estén validadas para cobros reales.
4. **Segundo proveedor (Car Center / VextCentral):** implementar adaptador en cuanto se reciba la URL base y contrato oficial de la API.
