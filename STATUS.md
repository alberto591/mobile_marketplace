# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-20
- **Fase completada:** Paso 13 — Activación y Verificación Exitosa de Notificaciones Reales por Email en Staging
- **Estado de pruebas:** 129 pruebas automatizadas pasando al 100% (91 en `@mobile-marketplace/core`, 38 en `@mobile-marketplace/mobile`)
- **Tipado estático:** TypeScript estricto (`tsc --noEmit`) superado con 0 errores en core y mobile
- **Compilación móvil:** Bundle iOS para Hermes verificado (1166 módulos), configurable en modo `backend` (PostgREST directo a staging) y modo `mock`
- **Proyecto Supabase Staging:** `lmsjgxhzfksyrlxyqndd` (West Europe - Ireland)
- **Edge Functions Desplegadas:** `sync-batch` (sincronización protegida), `image-proxy` (proxy de imágenes hardened), `submit-inquiry` (recepción, validación atómica, outbox e integración Resend en modo de pruebas)
- **Proveedor de Email:** Resend operativo en staging (modo test estrictamente contenido hacia `loopinnova.admin@gmail.com`)
- **Repositorio Remoto GitHub:** `https://github.com/alberto591/mobile_marketplace` (rama `main`)

---

## 1. Resumen Ejecutivo del Estado

Se ha completado con éxito la activación y prueba real del sistema de **notificaciones comerciales telemáticas mediante Resend** en el entorno de Supabase Staging:

1. **Prueba Real de Envío Verificada:**
   - **Petición Aceptada por Resend:** La API de Resend aceptó y procesó el correo de notificación comercial devolviendo el identificador único `01a158b7-b939-7647-ac6e-8472dac1c51b`.
   - **Registro Outbox:** La tabla `inquiry_notifications` refleja el estado final `SENT` con destinatario `loopinnova.admin@gmail.com`, proveedor `resend` y fecha de entrega.
   - **Contención en Modo de Pruebas:** El sistema aplica `INQUIRY_EMAIL_TEST_MODE=true`, impidiendo de forma estricta que salgan correos a los desguaces reales mientras el entorno esté en fase de validación técnica.
   - **Idempotencia Garantizada:** Se comprobó que una segunda petición con la misma clave de idempotencia (`idem-resend-live-20261020-003`) devuelve la referencia existente (`INQ-202610-LXY9`) sin duplicar el envío de correos ni crear filas redundantes en la base de datos.
   - **Catálogo Inalterado:** Las 114 piezas originales de Eurodesguace Málaga permanecen 100% intactas.

2. **Integración de Car Center (VextCentral - Paso 12):**
   - Documentada en `docs/providers/car-center-vextcentral-api.md`. Se mantiene a la espera de la URL base y contrato oficial del canal de VextCentral para implementar el adaptador sin inventar endpoints ni datos sintéticos.

---

## 2. Cobertura de Pruebas Automatizadas

Se ejecutan **129 pruebas automatizadas** pasando al 100% con Vitest:

| Módulo / Archivo | Pruebas | Estado | Cobertura |
|---|---|---|---|
| `packages/core/test/commercial-inquiries.test.ts` | 14 | Superado | Esquemas de consulta, consentimiento, idempotencia, rate limiting y aislamiento en modo test |
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
| `apps/mobile/test/catalog-service.test.ts` | 12 | Superado | Agregación multi-proveedor, filtrado por Eurodesguace Málaga, referencias visuales |
| `apps/mobile/test/backend-catalog-service.test.ts` | 9 | Superado | Consulta PostgREST, headers anon, filtros, OEM vs visual, getPartById, Fail Fast, factoría, enrutamiento seguro de imágenes a image-proxy |
| `apps/mobile/test/live-backend-integration.test.ts` | 8 | Superado | 11 flujos de usuario contra Supabase Staging en vivo con inventario real |
| `apps/mobile/test/cart-service.test.ts` | 9 | Superado | Carrito, invariantes de cantidad 1, no duplicados, agrupación por desguace, persistencia, céntimos enteros |

---

## 3. Instrucciones para la Ejecución y Prueba Manual

### 3.1. Comprobación Técnica Previa
```bash
# 1. Comprobar suite completa (124 tests)
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
