# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-20
- **Fase completada:** Fase 2 — Mejora del MVP: Carrito de Recambios y Confirmación de Disponibilidad Asistida
- **Estado de pruebas:** 94 pruebas automatizadas pasando al 100% (57 en `@mobile-marketplace/core`, 37 en `@mobile-marketplace/mobile`)
- **Tipado estático:** TypeScript estricto (`tsc --noEmit`) superado con 0 errores en core y mobile
- **Compilación móvil:** Bundle iOS para Hermes verificado (1166 módulos, 2.7MB), configurable en modo `backend` (PostgREST directo a staging) y modo `mock`
- **Proyecto Supabase Staging:** `lmsjgxhzfksyrlxyqndd` (West Europe - Ireland)
- **Repositorio Remoto GitHub:** `https://github.com/alberto591/mobile_marketplace` (rama `main`)

---

## 1. Resumen Ejecutivo del Estado

Se ha auditado y estabilizado el catálogo en **Supabase Staging (`lmsjgxhzfksyrlxyqndd`)** (114 piezas reales congeladas de Eurodesguace Málaga) y se ha incorporado el sistema de **Carrito de Recambios Móvil**:

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
   - **Cálculo monetario exacto:** Subtotales calculados en céntimos enteros con `addMoney` y formateados con `formatMoney` (IVA incluido, subtotal provisional).

2. **Flujo de Confirmación de Disponibilidad (Honestidad Radical):**
   - **El stock no está reservado:** Se informa claramente al usuario de que el stock físico no se bloquea al añadir al carrito.
   - **Ausencia de checkout ficticio:** No se simulan compras con tarjeta ni pedidos confirmados.
   - **Limitaciones de la API documentadas:** La API del desguace es de solo lectura; la solicitud se registra localmente en el dispositivo y se explican los bloqueos técnicos reales.

3. **Diagnóstico del CDN de Imágenes Externo:**
   - Se ha documentado que el certificado SSL del CDN de Eurodesguace Málaga (`cdn11.metasync.com`) caducó el 19 de octubre de 2026 a las 23:59:59 GMT (`verify error:num=10:certificate has expired`).
   - React Native y los componentes `PartCard` y `PartDetailScreen` disponen de manejo `onError` con fallback visual elegante `[Fotografía no disponible]`.

---

## 2. Cobertura de Pruebas Automatizadas

Se ejecutan **94 pruebas automatizadas** pasando al 100% con Vitest:

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
| `apps/mobile/test/catalog-service.test.ts` | 12 | Superado | Agregación multi-proveedor, filtrado por Eurodesguace Málaga, referencias visuales |
| `apps/mobile/test/backend-catalog-service.test.ts` | 8 | Superado | Consulta PostgREST, headers anon, filtros, OEM vs visual, getPartById, Fail Fast, factoría |
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
