# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-20
- **Fase completada:** Fase 2 — Paso 7: Validación de la App Real, Calidad del Catálogo y Preparación para Escalar (Completada al 100%)
- **Estado de pruebas:** 81 pruebas automatizadas pasando al 100% (55 en `@mobile-marketplace/core`, 26 en `@mobile-marketplace/mobile`)
- **Tipado estático:** TypeScript estricto (`tsc --noEmit`) superado con 0 errores en core y mobile
- **Compilación móvil:** Bundle iOS para Hermes verificado, configurable en modo `backend` (PostgREST directo a staging) y modo `mock`
- **Proyecto Supabase Staging:** `lmsjgxhzfksyrlxyqndd` (West Europe - Ireland)
- **Repositorio Remoto GitHub:** `https://github.com/alberto591/mobile_marketplace` (rama `main`)

---

## 1. Resumen Ejecutivo del Estado

Se ha completado el **Paso 7 (Validación de la App Real, Calidad del Catálogo, Seguridad y Preparación para Escalar)**:

1. **Auditoría y Corrección de Referencias Visuales vs OEM:**
   - Detectada y subsanada la inconsistencia en la ficha de pieza (`apps/mobile/app/part/[id].tsx`): la comprobación previa comparaba `ref.brandName === 'REFERENCIA_VISUAL'`, que resultaba indefinida para filas de base de datos donde solo existía `reference_type = 'REFERENCIA_VISUAL'`.
   - La pieza `91010` («MANDO CALEFACCION / AIRE ACONDICIONADO») con `refvisual = 5073401000013` ahora se presenta inequívocamente como **«Referencia visual del proveedor»** con aviso explícito: *(Lectura de etiqueta/troquelado · No verificada como OEM oficial)*.
   - En tarjetas de listado (`PartCard.tsx`) se muestra como `Ref. Visual: ...` en lugar de `OEM: ...`.
   - En el evaluador de compatibilidad (`CompatibilityBadge.tsx`), una coincidencia por referencia visual nunca otorga compatibilidad oficial garantizada (`isGuaranteed: false`, confianza `ATTRIBUTES_MATCH`).
   - El dominio canónico (`packages/core`) prioriza referencias OEM oficiales y expone `hasOfficialOEMReference(part)`.

2. **Activación Robusta del Modo Backend y Fail-Fast en UI:**
   - Corregido el router móvil: las vistas `apps/mobile/app/results.tsx` y `apps/mobile/app/part/[id].tsx` importaban directamente la instancia de `mock-catalog.service.ts`. Se refactorizaron para consumir la factoría centralizada `catalog-service.factory.ts`.
   - Activación vía variable de entorno pública: `EXPO_PUBLIC_CATALOG_DATA_SOURCE=backend` conmuta de forma determinista a `BackendCatalogService`.
   - Principio Fail-Fast implementado en la interfaz: ante fallos de red o errores HTTP del backend, la app renderiza estados de error explícitos (`EmptyState` con mensaje técnico y botón de reintento). Jamás se inyectan fixtures ni datos simulados para ocultar una caída del backend.
   - Configuración segura: el cliente móvil únicamente recibe variables públicas (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Ninguna clave privada (`EURODESGUACE_API_KEY`, `SYNC_ADMIN_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) está expuesta en el bundle.

3. **Auditoría de Datos Reales en Supabase Staging:**
   - Inspeccionadas en modo solo lectura las 10 piezas persistidas en staging (`lmsjgxhzfksyrlxyqndd`):
     - 10/10 vinculadas a Eurodesguace Málaga S.L. (`00000000-0000-4000-a000-000000000101`).
     - 10 UUIDs canónicos independientes (sin colisiones).
     - Precios íntegros en centavos coincidentes con origen (p.ej. 4295 céntimos = 42,95 EUR para ref `91010`).
     - 38 imágenes reales en CDN correctamente vinculadas con sus piezas e índices de ordenación.
     - `codvehiculo` persistido como `donor_vehicle_code` (vehículo donante), sin confundirse con el vehículo del comprador.
     - 10 referencias tipadas como `REFERENCIA_VISUAL`.
     - 0 registros con baja lógica expuestos en la vista pública `public_catalog_parts` (`deleted_at IS NULL`).

4. **Validación de Flujos de la Interfaz con Catálogo Real:**
   - Verificados los 9 flujos de usuario mediante suite de integración real con staging (`apps/mobile/test/live-backend-integration.test.ts`):
     1. Búsqueda de «CALEFACCION»: devuelve exactamente las 2 piezas reales esperadas.
     2. Detalle de pieza Citroën Nemo (`91010`): título, precio formateado (42,95 EUR), 4 fotos, donante y referencia visual.
     3. Datos de vendedor verificado CAT: Eurodesguace Málaga, 12 meses de garantía, 14 días de devolución.
     4. Ordenación por precio ascendente y descendente sobre datos reales.
     5. Búsquedas sin resultados devuelven lista vacía honesta (`[]`).
     6. Caída de conexión genera error controlado sin introducir datos mock.

5. **Auditoría de Seguridad y Permisos:**
   - El rol `anon` accede únicamente en lectura a `public_catalog_parts` (HTTP 200).
   - Acceso denegado (HTTP 401) para `anon` en `source_integrations`, `sync_logs` e intentos de escritura en `parts`.
   - Endpoint administrativo `sync-batch` de la Edge Function protegido con HTTP 401 Unauthorized ante peticiones sin `service_role` o secreto administrativo.
   - Sin registros de tokens ni datos sensibles en logs del cliente.

6. **Plan de Escalado de Catálogo (50, 500 y 31.000 piezas):**
   - Diseñada estrategia de ingesta por lotes con control de cursor, pausas para respetar rate limits (HTTP 429 con Retry-After), métricas en `sync_logs` y recomendaciones de índices parciales en PostgreSQL para optimizar consultas de `public_catalog_parts`.

---

## 2. Cobertura de Pruebas Automatizadas

Se ejecutan **81 pruebas automatizadas** pasando al 100% con Vitest:

| Módulo / Archivo | Pruebas | Estado | Cobertura |
|---|---|---|---|
| `packages/core/test/money.test.ts` | 8 | Superado | Centavos enteros, parsing decimal, operaciones seguras |
| `packages/core/test/oem-normalization.test.ts` | 5 | Superado | Limpieza de caracteres, equivalencias y mayúsculas |
| `packages/core/test/compatibility-signal.test.ts` | 6 | Superado | OEM oficial vs referencia visual del CAT (no garantizada) |
| `packages/core/test/validation-and-errors.test.ts` | 3 | Superado | Esquemas Zod, rechazo de negativos y normativas CAT |
| `packages/core/test/duplicate-and-traceability.test.ts` | 3 | Superado | Aislamiento de origen, preservación multi-desguace y proyección |
| `packages/core/test/mock-adapters.test.ts` | 10 | Superado | Paginación, capacidades opcionales, consulta de stock y 404 |
| `packages/core/test/eurodesguace-adapter.test.ts` | 11 | Superado | Parsing de coma decimal, Zod schemas, 429 Retry-After, cursor, confidencialidad |
| `packages/core/test/eurodesguace-sync-engine.test.ts` | 5 | Superado | Idempotencia, paginación con cursor, bajas lógicas, fallo intermedio, métricas |
| `packages/core/test/sync-edge-function-security.test.ts` | 4 | Superado | Autorización de sync-batch (401), token inválido, sanitized health check |
| `apps/mobile/test/catalog-service.test.ts` | 12 | Superado | Agregación multi-proveedor, filtrado por Eurodesguace Málaga, referencias visuales |
| `apps/mobile/test/backend-catalog-service.test.ts` | 8 | Superado | Consulta PostgREST, headers anon, filtros, OEM vs visual, getPartById, Fail Fast, factoría |
| `apps/mobile/test/live-backend-integration.test.ts` | 6 | Superado | 9 flujos de usuario contra Supabase Staging en vivo (búsqueda, detalle, filtros, errores) |

---

## 3. Instrucciones de Ejecución

### Comprobación de Pruebas y Tipado
```bash
# Ejecutar los 81 tests del monorepo
npm test

# Comprobar tipado TypeScript estricto en core y mobile
npm run typecheck
```

### Configuración de Modo Backend Móvil
Crear o ajustar `.env.local` en la raíz del proyecto o en `apps/mobile`:
```bash
EXPO_PUBLIC_SUPABASE_URL=https://lmsjgxhzfksyrlxyqndd.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<tu_anon_key_publica>
EXPO_PUBLIC_CATALOG_DATA_SOURCE=backend
```

### Iniciar Aplicación Móvil
```bash
# Modo backend conectado a staging
npm run start -w @mobile-marketplace/mobile
```
