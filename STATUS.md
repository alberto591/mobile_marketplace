# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-19
- **Fase completada:** Fase 2 — Paso 6: Staging, Auditoría de Seguridad y Primera Sincronización Real (Completada al 100%)
- **Estado de pruebas:** 73 pruebas automatizadas pasando al 100% (54 en `@mobile-marketplace/core`, 19 en `@mobile-marketplace/mobile`)
- **Compilación móvil:** Bundle iOS para Hermes verificado y compatible con modo `backend` (PostgREST) y modo `mock`
- **Proyecto Supabase Staging:** `lmsjgxhzfksyrlxyqndd` (West Europe - Ireland)
- **Repositorio Remoto GitHub:** `https://github.com/alberto591/mobile_marketplace` (rama `main` sincronizada)

---

## 1. Resumen Ejecutivo del Estado

Se ha completado la **Fase 6 completa (Staging, Migraciones, Despliegue de Edge Function y Sincronización Piloto Real)**:

1. **Migraciones SQL en Staging (100% aplicadas):**
   - Vinculado el proyecto de staging `lmsjgxhzfksyrlxyqndd` (`mobile_marketplace`).
   - Aplicadas sin errores las 4 migraciones canónicas:
     - `20261019000000_canonical_catalog_schema.sql` (tablas de catálogo, donantes, OEM, imágenes, logs, constraints y RLS).
     - `20261019000001_eurodesguace_vendor_seed.sql` (seed idempotente de Eurodesguace Málaga S.L.).
     - `20261019000002_catalog_persistence_refinements.sql` (referencias visuales, vehículos donantes y vista `public_catalog_parts`).
     - `20261019000003_view_security_hardening.sql` (vista `public_catalog_parts` endurecida con `security_invoker = true, security_barrier = true`, RLS con `deleted_at IS NULL` y revocación total de tablas privadas a roles públicos).

2. **Despliegue y Configuración de Edge Function:**
   - Secretos remotos custodiados en Supabase (`EURODESGUACE_API_KEY` y `EURODESGUACE_BASE_URL`).
   - Edge Function `eurodesguace-sync` desplegada en Supabase con `Deno.serve(handler)`.
   - Endpoint `action=ping`: respuesta instantánea en runtime Deno (HTTP 200).
   - Endpoint `action=health`: diagnóstico sanitizado con la API en vivo de Eurodesguace Málaga (HTTP 200).
   - Endpoint `action=sync-batch`: protegido con HTTP 401 Unauthorized ante llamadas anónimas.

3. **Primera Sincronización Real de Catálogo (Lote Piloto Controlado):**
   - Ejecutado script `scripts/sync_eurodesguace_pilot.py` con un lote piloto controlado de 10 piezas reales procedentes de la API de Eurodesguace Málaga.
   - 10 piezas persistidas con éxito en las tablas canónicas:
     - `parts` (10 filas)
     - `part_vehicles` (especificaciones completas de vehículos donantes Citroen Nemo, Renault Laguna, Nissan Cabstar, Peugeot 307)
     - `part_oem_references` (referencias visuales y estampadas normalizadas)
     - `part_images` (enlaces reales a imágenes en CDN)
   - Ejecutada prueba de **idempotencia**: segunda ejecución con el mismo lote arrojó 0 duplicados y actualizó `sync_logs` con auditoría completa de ejecución.

4. **Verificación End-to-End con la Aplicación Móvil:**
   - La vista pública `public_catalog_parts` es consultable por el rol `anon` vía PostgREST y no expone datos bancarios, fiscales ni credenciales privadas.
   - Comprobada la integración directa mediante `BackendCatalogService`:
     - Búsqueda por texto (`query: "CALEFACCION"`): 2 resultados reales devueltos con datos agregados.
     - Consulta unitaria `getPartById`: recupera ficha técnica, fotos, desguace verificado CAT y referencias OEM.
   - El proveedor B se mantiene funcional en modo `mock` sin interferencia mutua.

---

## 2. Cobertura de Pruebas Automatizadas

Se ejecutan **73 pruebas automatizadas** pasando al 100% con Vitest:

| Módulo / Archivo | Pruebas | Estado | Cobertura |
|---|---|---|---|
| `packages/core/test/money.test.ts` | 8 | Superado | Centavos enteros, parsing decimal, operaciones seguras |
| `packages/core/test/oem-normalization.test.ts` | 5 | Superado | Limpieza de caracteres, equivalencias y mayúsculas |
| `packages/core/test/compatibility-signal.test.ts` | 5 | Superado | OEM verificado vs donante similar vs discrepancia de coche |
| `packages/core/test/validation-and-errors.test.ts` | 3 | Superado | Esquemas Zod, rechazo de negativos y normativas CAT |
| `packages/core/test/duplicate-and-traceability.test.ts` | 3 | Superado | Aislamiento de origen, preservación multi-desguace y proyección |
| `packages/core/test/mock-adapters.test.ts` | 10 | Superado | Paginación, capacidades opcionales, consulta de stock y 404 |
| `packages/core/test/eurodesguace-adapter.test.ts` | 11 | Superado | Parsing de coma decimal, Zod schemas, 429 Retry-After, cursor, confidencialidad |
| `packages/core/test/eurodesguace-sync-engine.test.ts` | 5 | Superado | Idempotencia, paginación con cursor, bajas lógicas, fallo intermedio, métricas |
| `packages/core/test/sync-edge-function-security.test.ts` | 4 | Superado | Autorización de sync-batch (401), token inválido, sanitized health check |
| `apps/mobile/test/catalog-service.test.ts` | 12 | Superado | Agregación multi-proveedor, filtrado por Eurodesguace Málaga, referencias visuales |
| `apps/mobile/test/backend-catalog-service.test.ts` | 7 | Superado | Consulta PostgREST, headers anon, filtros, OEM vs visual, getPartById, Fail Fast, factoría |

---

## 3. Instrucciones de Ejecución

### Comprobación de Pruebas y Tipado
```bash
# Ejecutar los 73 tests del monorepo
npm test

# Comprobar tipado TypeScript estricto en core y mobile
npm run typecheck
```

### Ejecutar Sincronización Piloto a Staging
```bash
python3 scripts/sync_eurodesguace_pilot.py
```

### Iniciar Aplicación Móvil
```bash
# Conectar con catálogo real en Supabase Staging
npm run start -w @mobile-marketplace/mobile
```
