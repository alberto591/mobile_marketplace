# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-20
- **Fase completada:** Fase 2 — Mejora del MVP: Carrito de Recambios, Hardening de Image Proxy y Validación Final
- **Estado de pruebas:** 113 pruebas automatizadas pasando al 100% (75 en `@mobile-marketplace/core`, 38 en `@mobile-marketplace/mobile`)
- **Tipado estático:** TypeScript estricto (`tsc --noEmit`) superado con 0 errores en core y mobile
- **Compilación móvil:** Bundle iOS para Hermes verificado (1166 módulos, 2.7MB), configurable en modo `backend` (PostgREST directo a staging) y modo `mock`
- **Proyecto Supabase Staging:** `lmsjgxhzfksyrlxyqndd` (West Europe - Ireland)
- **Edge Functions Desplegadas:** `sync-batch` (sincronización protegida), `image-proxy` (proxy de imágenes hardened con caché pública, SSRF guard, timeouts de 10s y tope de 10MB)
- **Repositorio Remoto GitHub:** `https://github.com/alberto591/mobile_marketplace` (rama `main`)

---

## 1. Resumen Ejecutivo del Estado

Se ha auditado y estabilizado el catálogo en **Supabase Staging (`lmsjgxhzfksyrlxyqndd`)** (114 piezas reales congeladas de Eurodesguace Málaga) y se ha incorporado el sistema de **Carrito de Recambios Móvil** junto con la solución de resolución de imágenes **Image Proxy** hardened:

1. **Sistema de Carrito de Recambios y Reglas de Dominio:**
   - **Invariante de unidad física única:** Cada recambio es una unidad individual procedente de un vehículo donante concreto. Se restringe estrictamente a 1 unidad por oferta física sin permitir incrementos artificiales.
   - **Prevención de duplicados:** Se impide añadir la misma pieza física dos veces al carrito (`part.id`).
   - **Estados de disponibilidad respetados:**
     - `AVAILABLE`: Permite «Añadir al carrito» (o muestra «En el carrito» permitiendo navegar al carrito).
     - `PENDING_CONFIRMATION`: Mantiene «Consultar disponibilidad» abriendo la consulta individual.
     - `OUT_OF_STOCK` / `WITHDRAWN`: Deshabilita la acción con estado no disponible.
   - **Inmutabilidad de catálogo:** Añadir una pieza al carrito local jamás altera su estado de disponibilidad en el backend.
   - **Persistencia local segura:** El carrito se almacena en el dispositivo mediante `@react-native-async-storage/async-storage` a través de la interfaz `ICartStorage`, sobreviviendo a recargas y reinicios de la app sin almacenar credenciales ni datos sensibles.
   - **Agrupación visual por CAT:** Las piezas se agrupan por `vendor.id` con subtotales por desguace para facilitar el futuro cálculo de portes por centro.
   - **Cálculo monetario exacto:** Subtotales calculados en céntimos enteros con `addMoney` y formateados con `formatMoney` (subtotal provisional).

2. **Flujo de Confirmación de Disponibilidad (Honestidad Radical):**
   - **El stock no está reservado:** Se informa claramente al usuario de que el stock físico no se bloquea al añadir al carrito.
   - **Ausencia de checkout ficticio:** No se simulan compras con tarjeta ni pedidos confirmados.
   - **Limitaciones de la API documentadas:** La API del desguace es de solo lectura y de actualización periódica; la solicitud se registra estrictamente de forma local en el dispositivo y no se transmite a servidores del CAT.

3. **Revisión de Honestidad Comercial y Tratamiento Fiscal:**
   - **Eliminación de afirmaciones sobre IVA:** Al no existir confirmación contractual de que los precios de inventario incluyan IVA ni desglose fiscal completo en la API, se eliminaron las leyendas de «IVA incluido» en todas las pantallas (fichas, tarjetas, modal de consulta, carrito y confirmación), sustituyéndolas por la advertencia prudente: «Precio publicado por el desguace. Impuestos aplicables y gastos de transporte por confirmar».
   - **Significado estricto de `AVAILABLE`:** Las piezas con dicho estado muestran «Figura disponible en catálogo» y notas de advertencia explícitas indicando que la existencia física real en almacén debe confirmarse con el vendedor.
   - **Filtro de búsqueda sincero:** El filtro de disponibilidad en resultados se etiqueta como «Disponibles en catálogo» en lugar de «En stock».
   - **Claridad sobre el guardado local:** La pantalla de confirmación deja constancia de que los datos quedan guardados como borrador local en el dispositivo para facilitar el contacto con el desguace, sin fingir transmisiones a servidores externos.

4. **Resolución Segura de Imágenes (Hardening de Edge Function Image Proxy):**
   - **Causa raíz diagnosticada:** El certificado SSL wildcard del CDN externo del desguace (`cdn11.metasync.com`) caducó el 19 de octubre de 2026 a las 23:59:59 GMT (`verify error:num=10:certificate has expired`). iOS App Transport Security (ATS) bloquea tajantemente conexiones a certificados caducados en dispositivos físicos.
   - **Hardening de seguridad implementado (Paso 10):**
     - **Validación estricta de URLs:** Exclusivamente protocolo HTTPS, rechazo de credenciales (userinfo), puertos no estándar y direcciones IP literales (IPv4/IPv6).
     - **Lista blanca restringida:** Limitada estrictamente a `cdn11.metasync.com`, `eurodesguacemalaga.com` y `www.eurodesguacemalaga.com`.
     - **Seguimiento seguro de redirecciones:** `redirect: 'manual'`, límite de 2 saltos re-evaluando cada destino con el validador de seguridad.
     - **Timeouts:** Timeout explícito de 10 segundos por petición upstream mediante `AbortController`.
     - **Tope de tamaño de 10MB:** Validación previa de `Content-Length` y corte de lectura en flujo de streaming sin depender exclusivamente del encabezado.
     - **Validación de tipos MIME:** Se aceptan únicamente `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/avif`. Se rechaza HTML, JSON y ejecutables con HTTP 415.
     - **Política de caché:** `Cache-Control: public, max-age=2592000, s-maxage=2592000, immutable` exclusivamente para respuestas 200 de imágenes válidas; respuestas de error devuelven `Cache-Control: no-store`.

---

## 2. Cobertura de Pruebas Automatizadas

Se ejecutan **113 pruebas automatizadas** pasando al 100% con Vitest:

| Módulo / Archivo | Pruebas | Estado | Cobertura |
|---|---|---|---|
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
# 1. Comprobar suite completa (85 tests)
npm test

# 2. Comprobar tipado estricto
npm run typecheck
```

### 3.2. Arrancar la Aplicación Móvil
```bash
# Iniciar servidor de desarrollo de Expo conectado a Supabase Staging
npm run start -w @mobile-marketplace/mobile
```

### 3.3. Abrir en Dispositivo
- **iPhone Físico (Recomendado):** Instalar Expo Go, conectar el iPhone a la misma red Wi-Fi y escanear el código QR con la app Cámara.
- **Simulador iOS:** Si Xcode completo está instalado, pulsar `i` en la terminal de Metro.

---

## 4. Guía de Pruebas
Consultar el protocolo detallado en [docs/manual-testing-guide.md](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/manual-testing-guide.md).
