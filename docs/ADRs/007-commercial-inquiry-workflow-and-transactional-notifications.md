# ADR 007: Flujo Comercial de Consultas Asincronas (Inquiries) con Notificaciones Transaccionales y Fallback Silencioso

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Decisores:** Product Lead / Lead Frontend Architect / Senior Backend Engineer
- **Componentes Afectados:**
  - [inquiries.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/src/validation/inquiries.ts)
  - [submit-inquiry/index.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/submit-inquiry/index.ts)
  - [inquiry.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/inquiry.service.ts)
  - [InquiryModal.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/InquiryModal.tsx)
  - [commercial-inquiries.test.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/test/commercial-inquiries.test.ts)
- **Documentos Relacionados:**
  - [ADR 002: Separación entre Entidad de Inventario (Part) y Proyección Agregada de Catálogo (ProductIdentity)](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/002-product-identity-vs-part-inventory.md)
  - [ADR 008: Checkout Transaccional Marketplace con Stripe Connect Direct Charges, Retención de Comisión (Application Fee) y Bloqueo de Modo Live](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/008-transactional-checkout-v2-stripe-connect-direct-charges.md)

---

## 1. Contexto y Definicion del Problema

En el comercio automotriz de recambios recuperados procedentes de Centros Autorizados de Tratamiento (CAT), un porcentaje muy significativo de compradores (tanto talleres mecánicos independientes como conductores particulares) no ejecuta una compra directa inmediata mediante pasarela de pago sin antes verificar aspectos técnicos críticos:
1. Compatibilidad exacta con el bastidor (VIN) o código de motor de la ficha técnica.
2. Estado de desgaste específico de componentes mecánicos o eléctricos (por ejemplo, holguras en cremalleras de dirección, compresión de motores o desgaste de cuadros de instrumentos).
3. Posibilidad de recogida en mano en las instalaciones físicas del desguace o condiciones especiales de entrega urgente.

Obligar a los usuarios a pasar exclusivamente por un embudo transaccional de compra directa provocaría altas tasas de abandono y fricción comercial. Por ello, se requiere habilitar un canal formal de **Consultas Comerciales Asíncronas (Inquiries / Leads Calificados)** integrado en la ficha de cada recambio.

Este canal técnico debe resolver simultáneamente:
- **Protección contra Spam y Bots:** Formulario expuesto públicamente susceptible a envíos masivos automatizados.
- **Cumplimiento Estricto del RGPD:** Tratamiento lícito de datos personales (nombre, teléfono, correo y datos de vehículo) con registro verificable de consentimiento.
- **Resiliencia ante Ausencia de Credenciales en Entornos de Prueba:** La falta temporal de configuración de un proveedor de correo transaccional (ej. Resend) en entornos de desarrollo o staging no debe romper el flujo ni arrojar errores HTTP 500 al usuario.

---

## 2. Factores Decisivos (Decision Drivers)

1. **Captura Fiable del Lead Comercial:** Persistencia atómica de la consulta en base de datos relacional para que el desguace o el equipo comercial pueda gestionarla sin pérdida de información.
2. **Degradación Elegante (Graceful Fallback / Silent Bypass):** Si el servicio de correo transaccional externo (Resend) no está aprovisionado o sufre una caída, la consulta debe registrarse exitosamente con estado `SKIPPED_NOT_CONFIGURED` o `PENDING_NOTIFICATION`, confirmando la solicitud al usuario sin fallos visibles.
3. **Mecanismo Anti-Spam de Cero Fricción (Honeypot):** Descarte silencioso de robots sin penalizar a los usuarios legítimos con captchas intrusivos que degradan la experiencia móvil.
4. **Idempotencia y Limitación de Tasa (Rate Limiting):** Prevención de envíos duplicados por pulsación múltiple y mitigación de ataques por denegación de servicio.
5. **Tipado y Validación Canónica con Zod:** Validación estricta de formato de email, teléfono con prefijo internacional (+34), longitud de mensaje y aceptación legal obligatoria.

---

## 3. Opciones Consideradas

### Opción A: Enlace Simple de Correo `mailto:` en la Aplicación Móvil
Abrir el cliente de correo predeterminado del teléfono móvil del usuario con una plantilla prellenada hacia el desguace.
- **Ventajas:** Cero infraestructura en el backend.
- **Desventajas:** Cero trazabilidad para el marketplace; pérdida total de métricas de conversión comercial; el usuario puede no tener configurado un cliente de correo en su smartphone; imposible verificar consentimientos RGPD.

### Opción B: Integración Síncrona Acoplada a un Servicio de Correo (Bloqueante)
Enviar directamente la petición HTTP a la API de correo (Resend / SendGrid). Si la llamada a la API falla o las credenciales no existen, arrojar un error HTTP 500 y abortar la transacción.
- **Ventajas:** El usuario solo recibe confirmación si el email ya ha salido del servidor.
- **Desventajas:** Fragilidad absoluta; cualquier corte temporal en la pasarela de correo impide registrar consultas; bloquea entornos de pruebas y staging donde no siempre se dispone de credenciales comerciales activas.

### Opción C: Arquitectura Desacoplada con Persistencia Relacional, Validación Zod, Honeypot y Despacho Asíncrono con Fallback (Seleccionada)
Implementar la Edge Function `submit-inquiry` en Supabase:
1. Validación con esquemas Zod en [inquiries.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/src/validation/inquiries.ts).
2. Verificación del campo trampa (*honeypot*) `website_url_check`.
3. Inserción garantizada en la tabla `commercial_inquiries`.
4. Intento de despacho de notificación telemática vía Resend API. Si no hay claves configuradas, registrar el estado `SKIPPED_NOT_CONFIGURED` y responder al cliente móvil con éxito (`200 OK`).
- **Ventajas:** Robustez integral; nunca se pierden los datos del cliente potencial; desarrollo y staging desacoplados de servicios de pago de email; cumplimiento riguroso del RGPD.
- **Compromisos de Diseño (Trade-offs):** Requiere un esquema de base de datos específico y una cola o monitoreo periódico de consultas pendientes.

---

## 4. Decisión Adoptada

Se adopta la **Opción C: Flujo Asíncrono con Persistencia Relacional y Notificación Resiliente**.

### 4.1 Implementación Técnica y Flujo de Datos

1. **Esquema de Validación de Dominio:**
   El módulo [inquiries.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/src/validation/inquiries.ts) define el contrato estricto:
   - `part_id` y `vendor_id`: Identificadores canónicos UUID/string.
   - `customer_name`: Mínimo 2 caracteres, sanitizado.
   - `customer_phone` o `customer_email`: Al menos un canal de contacto válido; el teléfono se normaliza con prefijo E.164.
   - `consent_gdpr`: Booleano estrictamente `true`.
   - `honeypot`: Campo opcional `website_url_check` invisible en la UI.

2. **Detección de Bots por Honeypot:**
   En [submit-inquiry/index.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/submit-inquiry/index.ts):
   ```typescript
   if (body.website_url_check && body.website_url_check.trim() !== '') {
     // Descarte silencioso sin alertar al bot
     return new Response(JSON.stringify({ success: true, status: 'FILTERED_SPAM' }), { status: 200 });
   }
   ```

3. **Política de Fallback Silencioso para Notificaciones:**
   La Edge Function comprueba la disponibilidad de secretos de entorno:
   - Si `RESEND_API_KEY` o `EURODESGUACE_INQUIRY_EMAIL` no están presentes en el entorno:
     - La consulta se persiste en `commercial_inquiries` con `notification_status = 'SKIPPED_NOT_CONFIGURED'`.
     - La respuesta HTTP devuelve estado `200` con bandera descriptiva, permitiendo que la interfaz móvil muestre el mensaje de agradecimiento sin falsas alarmas de fallo técnico.
   - Si los secretos están configurados:
     - Se despacha el email transaccional con plantilla HTML detallando el recambio, fotografía, vehículo donante y datos de contacto del comprador.

4. **Interfaz de Usuario y Manejo Reactivo:**
   El componente [InquiryModal.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/InquiryModal.tsx) implementa gestión de estados (`idle`, `submitting`, `success`, `error`), limpiando el formulario tras el envío y evitando dobles pulsaciones mediante el deshabilitado del botón durante la llamada de red.

---

## 5. Consecuencias

### Positivas
- **Captura Eficaz de Oportunidades:** El marketplace habilita un canal de comunicación directo para piezas complejas o de alto valor que requieren confirmación técnica previa.
- **Entorno de Pruebas Continuo:** Los desarrolladores y evaluadores de control de calidad pueden probar íntegramente el flujo de la aplicación sin emitir correos reales a los desguaces ni requerir cuentas de pago de Resend.
- **Cumplimiento Legal:** Registro inmutable del consentimiento del usuario conforme a la normativa europea de protección de datos (RGPD).

### Riesgos Residuales y Mitigaciones
- **Riesgo:** Consultas acumuladas en estado `SKIPPED_NOT_CONFIGURED` en entornos de producción si se revoca accidentalmente la clave de API de Resend.
  - *Mitigacion:* Alertas estructuradas en logs de Supabase que reportan la ausencia de credenciales como evento `WARNING` con identificador de trazabilidad.
