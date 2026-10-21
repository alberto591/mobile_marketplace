# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-21
- **Fase completada:** BuscaPiezas 24H — MVP Experience Upgrade (7 Features completadas)
- **Estado de pruebas:** 193 pruebas automatizadas pasando al 100% (105 en `@mobile-marketplace/core`, 88 en `@mobile-marketplace/mobile`)
- **Tipado estático:** TypeScript estricto (`tsc --noEmit`) superado con 0 errores en core y mobile
- **Compilación móvil:** Compatible con Expo SDK 57 / React Native 0.86 / `@stripe/stripe-react-native 0.64.0` (21/21 verificaciones de expo-doctor superadas)
- **Proyecto Supabase Staging:** `lmsjgxhzfksyrlxyqndd` (West Europe - Ireland)
- **Edge Functions Desplegadas:** `sync-batch`, `image-proxy`, `submit-inquiry`, `create-payment-intent` (bloqueo estricto de livemode, sincronización de readiness de Stripe, cálculo de precios fiable), `stripe-webhook` (verificación HMAC-SHA256, deduplicación, reintentos seguros y reconciliación de subpedidos)
- **Proveedor de Pagos:** Stripe Connect (modo Test, Direct Charges en cuenta conectada del desguace con retención de 10% de comisión mediante `application_fee_amount`)
- **Repositorio Remoto GitHub:** `https://github.com/alberto591/mobile_marketplace` (rama `main`)

---

## 1. Resumen Ejecutivo del Estado

Se ha completado la auditoría preflight del **Checkout Transaccional V2 con Stripe Connect** en el entorno de Supabase Staging:

1. **Modelo de Negocio Marketplace Implementado:**
   - **Vendedor Legal:** Cada desguace (CAT) es el vendedor registrado ante el consumidor.
   - **Direct Charges:** Los pagos se dirigen a la cuenta conectada del desguace (`acct_...`), reteniendo la plataforma un 10% de comisión (`application_fee_amount`) calculada estrictamente sobre el subtotal de piezas (excluyendo envío e impuestos).
   - **Restricción de Primer Lanzamiento:** Limitado a un único vendedor por pedido; carritos multiproveedor informan al usuario y procesan las piezas del CAT principal primero.
   - **Tarifa Fija de Envíos en Staging:** 9,50 EUR (950 céntimos).
   - **Tratamiento Fiscal:** Marcado explícitamente como `UNCONFIGURED` (0,00 EUR en pruebas; advertencia visible en UI y backend de que no constituye oferta comercial vinculante).
   - **Bloqueo Servidor de Modo Real:** La Edge Function `create-payment-intent` rechaza terminantemente claves `sk_live_`, `rk_live_` y `pk_live_` con código 403 mientras los tributos permanezcan sin configurar.

2. **Base de Datos y Seguridad (Migración `20261021000000_checkout_orders_and_stripe.sql`):**
   - Tablas creadas: `orders` (pedido padre), `order_suborders` (subpedido por vendedor), `order_items` (instantánea inmutable de piezas), `stripe_webhook_events` (deduplicación por `stripe_event_id`), `order_refunds`.
   - Modificación en `vendors`: metadatos de Stripe Connect (`stripe_account_id`, `stripe_charges_enabled`, `stripe_payouts_enabled`, etc.).
   - RLS estricto: mutaciones restringidas exclusivamente a `service_role`. Lectura segura de pedidos mediante RPC con `access_token` no predecible (protege el guest checkout).
   - Inalterabilidad del catálogo: las 114 piezas de Eurodesguace Málaga se mantienen intactas (`content-range: 0-0/114`).

3. **Integración de Car Center (VextCentral - Paso 12):**
   - Documentada en `docs/providers/car-center-vextcentral-api.md`. Se mantiene a la espera de la URL base y contrato oficial del canal de VextCentral para implementar el adaptador sin inventar endpoints ni datos sintéticos.

---

## 2. Cobertura de Pruebas Automatizadas

Se ejecutan **191 pruebas automatizadas** pasando al 100% con Vitest:

| Módulo / Archivo | Pruebas | Estado | Cobertura |
|---|---|---|---|
| `packages/core/test/transactional-checkout.test.ts` | 10 | Superado | Precios confiables, desglose de comisiones 10%, tarifas fijas 9,50 EUR, esquemas Zod de checkout y dirección |
| `packages/core/test/commercial-inquiries.test.ts` | 18 | Superado | Esquemas de consulta, consentimiento, idempotencia, rate limiting y aislamiento en modo test |
| `packages/core/test/vextcentral-contract.test.ts` | 2 | Superado | Esquema borrador y validaciones para piezas VextCentral |
| `packages/core/test/money.test.ts` | 8 | Superado | Centavos enteros, parsing decimal, operaciones seguras |
| `packages/core/test/oem-normalization.test.ts` | 5 | Superado | Limpieza de caracteres, equivalencias y mayúsculas |
| `packages/core/test/compatibility-signal.test.ts` | 6 | Superado | OEM oficial vs referencia visual del CAT (no garantizada) |
| `packages/core/test/validation-and-errors.test.ts` | 3 | Superado | Esquemas Zod, rechazo de negativos y normativas CAT |
| `packages/core/test/duplicate-and-traceability.test.ts` | 3 | Superado | Aislamiento de origen, preservación multi-desguace y proyección |
| `packages/core/test/mock-adapters.test.ts` | 10 | Superado | Paginación, capacidades opcionales, consulta de stock y 404 |
| `packages/core/test/eurodesguace-adapter.test.ts` | 11 | Superado | Parsing de coma decimal, Zod schemas, 429 Retry-After, cursor, confidencialidad |
| `packages/core/test/eurodesguace-sync-engine.test.ts` | 6 | Superado | Idempotencia, cursor, bajas lógicas, límite estricto de 50 piezas en servidor |
| `packages/core/test/sync-edge-function-security.test.ts` | 5 | Superado | Autorización de sync-batch (401), token inválido, clamp a 50 piezas en servidor |
| `packages/core/test/image-proxy-security.test.ts` | 18 | Superado | Hardening de image-proxy: SSRF, lista blanca, userinfo, redirecciones, timeouts 10s, tope 10MB, MIME y fallback seguro |
| `apps/mobile/test/checkout-service.test.ts` | 3 | Superado | Servicio cliente de checkout: creación de PaymentIntent, consulta de pedido por token RPC y manejo de errores tipados |
| `apps/mobile/test/catalog-service.test.ts` | 12 | Superado | Agregación multi-proveedor, filtrado por Eurodesguace Málaga, referencias visuales |
| `apps/mobile/test/backend-catalog-service.test.ts` | 9 | Superado | Consulta PostgREST, headers anon, filtros, OEM vs visual, getPartById, Fail Fast, factoría, enrutamiento seguro de imágenes a image-proxy |
| `apps/mobile/test/live-backend-integration.test.ts` | 8 | Superado | 11 flujos de usuario contra Supabase Staging en vivo con inventario real |
| `apps/mobile/test/cart-service.test.ts` | 9 | Superado | Carrito, invariantes de cantidad 1, no duplicados, agrupación por desguace, persistencia, céntimos enteros |
| `apps/mobile/test/category-grid.test.ts` | 5 | Superado | Feature 1: Agrupación visual de categorías y supresión de categorías vacías |
| `apps/mobile/test/whatsapp-contact.test.ts` | 9 | Superado | Feature 2: Normalización telefónica (+34), mensaje honesto prellenado sin falsos OEM y apertura de WhatsApp |
| `apps/mobile/test/share-part.test.ts` | 5 | Superado | Feature 3: Generación de mensaje para compartir con mecánico/cliente y manejo de Share nativo |
| `apps/mobile/test/favourites.test.ts` | 8 | Superado | Feature 4: Persistencia AsyncStorage, deduplicación, sincronización de estado y tolerancia a fallos |
| `apps/mobile/test/garage.test.ts` | 8 | Superado | Feature 5: Mi Garaje, serialización, filtrado por vehículo y guardarraíles de compatibilidad |
| `apps/mobile/test/savings-comparison.test.ts` | 6 | Superado | Feature 6: Ahorro matemático seguro, supresión ante PVP ausente y rigor en huella de CO₂ |
| `apps/mobile/test/cat-trust.test.ts` | 4 | Superado | Feature 7: Evaluación de desguaces CAT, verificación legal, garantías y enlaces oficiales |

---

## 3. Instrucciones para la Ejecución y Prueba Manual

### 3.1. Comprobación Técnica Previa
```bash
# 1. Comprobar suite completa (193 tests)
npm test

# 2. Comprobar tipado estricto
npm run typecheck
```

### 3.2. Arrancar la Aplicación Móvil
```bash
# Iniciar servidor de desarrollo de Expo conectado a Supabase Staging
npm run start -w @mobile-marketplace/mobile
```

---

## 4. Configuración Necesaria para Notificaciones Reales

Para activar el envío telemático de correos a Eurodesguaces Málaga en Staging/Producción, deben configurarse los siguientes secretos en Supabase:

- `RESEND_API_KEY`: Clave de API de Resend vinculada a la cuenta de mensajería.
- `INQUIRY_FROM_EMAIL`: Remitente de dominio verificado (ej. `consultas@tudominio.com`).
- `EURODESGUACE_INQUIRY_EMAIL`: Dirección de correo comercial confirmada por Eurodesguace Málaga para recibir solicitudes de compra de piezas.

*(Si no se configuran, el sistema opera en modo seguro `SKIPPED_NOT_CONFIGURED`, registrando todas las consultas en base de datos sin generar errores).*
