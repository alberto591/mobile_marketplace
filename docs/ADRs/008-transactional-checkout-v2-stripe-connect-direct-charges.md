# ADR 008: Checkout Transaccional Marketplace con Stripe Connect Direct Charges, Retencion de Comision y Bloqueo de Modo Live

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Decisores:** Chief Financial Officer (CFO) / Legal & Compliance Officer / Principal Backend Architect
- **Componentes Afectados:**
  - [checkout.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/src/validation/checkout.ts)
  - [20261021000000_checkout_orders_and_stripe.sql](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/migrations/20261021000000_checkout_orders_and_stripe.sql)
  - [create-payment-intent/index.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/create-payment-intent/index.ts)
  - [stripe-webhook/index.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/stripe-webhook/index.ts)
  - [checkout.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/checkout.service.ts)
  - [checkout.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/app/checkout.tsx)
  - [order/[reference].tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/app/order/[reference].tsx)
  - [transactional-checkout.test.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/test/transactional-checkout.test.ts)
- **Documentos Relacionados:**
  - [ADR 002: Separación entre Entidad de Inventario (Part) y Proyección Agregada de Catálogo (ProductIdentity)](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/002-product-identity-vs-part-inventory.md)
  - [ADR 007: Flujo Comercial de Consultas Asíncronas (Inquiries) con Notificaciones Transaccionales y Fallback Silencioso](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/007-commercial-inquiry-workflow-and-transactional-notifications.md)

---

## 1. Contexto y Definicion del Problema

La transición del marketplace desde un modelo de consulta por lead hacia una plataforma transaccional completa exige integrar un sistema de pagos seguro, robusto y conforme a la normativa fiscal y de intermediación europea (Directiva DAC7, PSD2 / SCA y normativa de garantías en bienes de consumo RDLeg 1/2007).

En el modelo de negocio del marketplace de recambios:
1. **Comerciante Registrado (Merchant of Record):** El desguace (CAT) es el vendedor legal directo frente al consumidor. Es la entidad mercantil que emite la factura, custodia la pieza física, efectúa el envío y responde legalmente de la garantía obligatoria de 1 año.
2. **Modelo de Ingresos de la Plataforma:** El marketplace actúa como agente mediador tecnológico y cobra una comisión del 10% sobre el subtotal del recambio por facilitar la infraestructura de búsqueda y la garantía transaccional.
3. **Complejidad Tributaria y Régimen Especial de Bienes Usados (REBU):** Los desguaces operan bajo regímenes fiscales específicos (IVA general del 21% o REBU con tributación sobre el margen de beneficio). La plataforma no puede asumir la facturación directa de los recambios sin incurrir en riesgos fiscales graves.
4. **Seguridad en Compras de Invitados (Guest Checkout):** Para maximizar la tasa de conversión, la compra no debe imponer el registro previo de usuario con contraseña, pero debe blindar criptográficamente el acceso al resumen del pedido.
5. **Prevención de Cobros Reales en Entornos de Prueba:** Prohibir terminantemente que el sistema procese cargos reales con tarjetas bancarias vivas mientras el motor de facturación e impuestos permanezca en fase de homologación.

---

## 2. Factores Decisivos (Decision Drivers)

1. **Cumplimiento Normativo PSD2 y SCA:** Los pagos deben ejecutarse con autenticación reforzada de clientes (*3D Secure 2*) sin que el marketplace manipule ni almacene números de tarjeta de crédito (PCI-DSS Nivel 1 delegado en Stripe).
2. **Arquitectura Stripe Connect Direct Charges:** El cobro bancario se origina directamente en la cuenta conectada del desguace vendedor (`Stripe-Account: acct_...`), reteniendo la plataforma la comisión acordada mediante `application_fee_amount`.
3. **Seguridad Criptográfica en Guest Checkout:** Acceso al pedido mediante identificador alfanumérico público (`reference`) emparejado con un token de acceso seguro de 256 bits (`access_token`) protegido por una función RPC en PostgreSQL con RLS estricto.
4. **Idempotencia Estricta en Webhooks:** Manejo atómico de eventos de Stripe (`payment_intent.succeeded`) con registro persistente de eventos procesados para prevenir duplicación de órdenes y cobros ante reintentos de red.
5. **Guardarraíl Inquebrantable de Seguridad de Claves (Fail-Fast 403 Lock):** Rechazo inmediato en servidor de cualquier clave de producción (`sk_live_`, `rk_live_`, `pk_live_`) mientras el régimen fiscal esté marcado como `UNCONFIGURED`.

---

## 3. Opciones Consideradas

### Opción A: Cobro Centralizado por el Marketplace (Merchant of Record Central)
El marketplace cobra el 100% del importe en su cuenta Stripe principal y posteriormente transfiere los fondos al desguace descontando comisiones.
- **Ventajas:** Permite carritos multiproveedor en un único cargo unificado para el cliente.
- **Desventajas:** La plataforma se convierte en el vendedor legal de todos los recambios usados; asume la responsabilidad fiscal de emitir facturas con REBU, la garantía de 1 año de piezas que nunca ha inspeccionado y el riesgo de contracargos/devoluciones por piezas defectuosas; inviable legal y operativamente para el tamaño del negocio.

### Opción B: Cargos Directos en Cuenta Conectada (Stripe Connect Direct Charges con Application Fee) (Seleccionada)
El pago se procesa directamente sobre la cuenta Stripe Express/Custom del desguace vendedor. El comprador ve en el extracto de su tarjeta el nombre del desguace vendedor. Stripe transfiere el importe íntegro al desguace y deduce automáticamente la comisión de la plataforma (`application_fee_amount`) del 10% sobre el subtotal de la pieza.
- **Ventajas:** Cumplimiento legal perfecto (el CAT es el Merchant of Record); las disputas y garantías recaen sobre el desguace custodio; cero riesgo fiscal de REBU para el marketplace; la plataforma recibe sus ingresos limpios por comisión de intermediación; comisiones calculadas de forma determinista en céntimos enteros.
- **Compromisos de Diseño (Trade-offs):** En la Fase 1, cada pedido debe pertenecer a un único desguace vendedor. Si el carrito contiene piezas de desguaces distintos, el sistema procesa las piezas del desguace principal primero.

### Opción C: Separated Charges and Transfers
Cargar en la plataforma y transferir a las cuentas conectadas a posteriori mediante la API de Transfers.
- **Ventajas:** Flexibilidad en la división de fondos.
- **Desventajas:** Riesgo regulatorio bajo la normativa PSD2 de servicios de pago en Europa (requiere licencia de entidad de pago o agente exento); mayores costes de procesamiento en Stripe.

---

## 4. Decisión Adoptada

Se adopta la **Opción B: Stripe Connect Direct Charges con Retención de Comisión mediante Application Fee**.

### 4.1 Modelo de Datos Relacional y Máquina de Estados

La migración [20261021000000_checkout_orders_and_stripe.sql](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/migrations/20261021000000_checkout_orders_and_stripe.sql) formaliza:

1. **Estructura de Pedidos y Trazabilidad:**
   - `orders`: Registro raíz con `reference` único (ej. `ORD-20261021-X7K2`), datos del comprador, estado global y `access_token` seguro.
   - `order_suborders`: Agrupación por desguace vendedor (`vendor_id`), vinculada a `stripe_payment_intent_id`, `stripe_transfer_id` y `application_fee_amount_cents`.
   - `order_items`: Instantánea inmutable (*snapshot*) de cada pieza en el momento de la compra (nombre, referencia OEM, precio unitario exacto en céntimos, URL de imagen y estado).
   - `stripe_webhook_events`: Registro de deduplicación de eventos por `stripe_event_id`.

2. **Cálculo Financiero Transaccional:**
   - `subtotal_cents`: Suma exacta de los precios de las piezas.
   - `shipping_fee_cents`: Tarifa fija de 9,50 EUR (950 céntimos) por pedido en fase Staging.
   - `tax_cents`: 0 céntimos (marcado explícitamente como `UNCONFIGURED` en entorno de prueba).
   - `application_fee_amount_cents`: `Math.round(subtotal_cents * 0.10)` (estrictamente el 10% del subtotal de piezas, excluyendo envío e impuestos).
   - `total_cents`: `subtotal_cents + shipping_fee_cents + tax_cents`.

3. **RPC Segura de Acceso para Invitados (Guest Access):**
   Para evitar que usuarios anónimos lean pedidos ajenos mediante PostgREST, las políticas RLS restringen la lectura directa de `orders`. Se implementa la función RPC de base de datos con `SECURITY DEFINER`:
   ```sql
   CREATE OR REPLACE FUNCTION get_order_by_token(p_reference TEXT, p_access_token TEXT)
   RETURNS JSONB ...
   ```
   Solo devuelve el pedido si coinciden exactamente la referencia y el token de 256 bits generado al crear la intención de pago.

4. **Edge Function `create-payment-intent` con Bloqueo de Modo Live:**
   En [create-payment-intent/index.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/create-payment-intent/index.ts):
   - Valida que la cuenta conectada del desguace tenga `stripe_charges_enabled = true`.
   - **Guardarraíl Estricto:** Si se detectan claves reales de Stripe (`sk_live_`, `rk_live_`, `pk_live_`), la función responde de inmediato con `HTTP 403 Forbidden`:
     ```json
     {
       "error": "Live mode payments strictly forbidden: Tax regime UNCONFIGURED. Only test mode keys permitted."
     }
     ```
   - Crea el `PaymentIntent` con cabecera `Stripe-Account: <vendor_stripe_account_id>` y parámetro `application_fee_amount`.

5. **Webhook Asíncrono con Verificación Criptográfica HMAC-SHA256:**
   En [stripe-webhook/index.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/stripe-webhook/index.ts):
   - Valida la firma `stripe-signature` con `STRIPE_WEBHOOK_SECRET`.
   - Comprueba la tabla `stripe_webhook_events`. Si el evento ya fue procesado, responde `200 OK` inmediatamente evitando dobles procesamientos.
   - Actualiza atómicamente el estado del pedido a `PAID` y marca las piezas vendidas como no disponibles en el inventario.

---

## 5. Consecuencias

### Positivas
- **Alineación Legal Total:** El desguace actúa como vendedor mercantil registrado conforme al RD 265/2021 y RDLeg 1/2007.
- **Monetización Automática:** La plataforma recibe el 10% neto de comisión retenido directamente en la liquidación de Stripe sin necesidad de emitir facturas de recobro a los desguaces.
- **Protección Criptográfica en Guest Checkout:** Compras fluidas sin registro obligatorio con máxima seguridad de acceso mediante tokens RPC.
- **Blindaje Financiero y Fiscal:** Imposibilidad de cobrar accidentalmente a clientes reales con impuestos desconfigurados.

### Riesgos Residuales y Mitigaciones
- **Riesgo:** Un comprador añade piezas de dos desguaces distintos a su cesta de compra.
  - *Mitigacion:* El servicio de carrito [cart.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/app/cart.tsx) agrupa visualmente las piezas por desguace vendedor e informa con total transparencia al usuario de que la compra se formaliza por vendedor para garantizar envíos independientes directos desde cada instalación.
