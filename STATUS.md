# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-20
- **Fase completada:** Fase 2 — Paso 8: Ingesta Controlada de 50 Piezas Reales en Supabase Staging (Completada al 100%)
- **Estado de pruebas:** 85 pruebas automatizadas pasando al 100% (57 en `@mobile-marketplace/core`, 28 en `@mobile-marketplace/mobile`)
- **Tipado estático:** TypeScript estricto (`tsc --noEmit`) superado con 0 errores en core y mobile
- **Compilación móvil:** Bundle iOS para Hermes verificado, configurable en modo `backend` (PostgREST directo a staging) y modo `mock`
- **Proyecto Supabase Staging:** `lmsjgxhzfksyrlxyqndd` (West Europe - Ireland)
- **Repositorio Remoto GitHub:** `https://github.com/alberto591/mobile_marketplace` (rama `main`)

---

## 1. Resumen Ejecutivo del Estado

Se ha completado el **Paso 8 (Ingesta Controlada de 50 Piezas Reales en Supabase Staging, Auditoría de Persistencia e Idempotencia)**:

1. **Ingesta Controlada de 50 Piezas Reales:**
   - Ejecutado el proceso de ingesta con límite estricto de servidor de 50 piezas (`MAX_PILOT_LIMIT = 50`) desde la API de producción de Eurodesguace Málaga hacia Supabase Staging (`lmsjgxhzfksyrlxyqndd`).
   - Primera pasada (`batch_1792474744_50`, 47.3s): 50 piezas procesadas, **40 nuevas insertadas**, **10 preexistentes actualizadas** (las procedentes del piloto anterior), 0 fallidas.
   - Total de piezas en `parts`: **50 piezas reales**.

2. **Verificación de Persistencia y Relaciones:**
   - **Unicidad e Identificadores:** 50/50 identificadores externos únicos (`external_part_id`), sin colisiones y manteniendo el `refid` de origen.
   - **Vehículos Donantes:** 49 registros en `part_vehicles` con código de donante (`donor_vehicle_code`) correctamente desacoplado del vehículo del comprador.
   - **Referencias Visuales:** 42 referencias en `part_oem_references` tipadas al 100% como `REFERENCIA_VISUAL` (ninguna etiquetada falsamente como OEM oficial).
   - **Fotografías Reales:** 170 imágenes persistidas en `part_images` con URLs completas de CDN de Eurodesguace Málaga, ordenación `sort_order` y flag `is_primary` intactos.
   - **Integridad Referencial:** 0 relaciones huérfanas en vehículos, referencias u fotografías.

3. **Demostración Empírica de Idempotencia:**
   - Se re-ejecutó exactamente el mismo lote de 50 piezas (`batch_1792474823_50`, 55.8s).
   - Resultados de la segunda pasada: **50 procesadas, 0 creadas, 50 actualizadas, 0 fallidas**.
   - El recuento total de piezas en base de datos permaneció exactamente en 50 y el de imágenes en 170 (cero duplicados).

4. **Punto de Control y Trazabilidad:**
   - La tabla `source_integrations` actualizó su punto de control con el cursor reportado por el proveedor: `last_cursor: '57'`, `sync_status: 'IDLE'`, `last_success_at: '2026-10-20T05:39:52Z'`.
   - La tabla `sync_logs` contiene los dos registros de auditoría completos con métricas detalladas de ejecución.

5. **Análisis Técnico de Índices:**
   - Se analizó la propuesta `CREATE INDEX idx_parts_active_catalog ON parts (vendor_id, category_id, price_cents) WHERE deleted_at IS NULL AND availability_status = 'AVAILABLE';`.
   - Se concluyó técnicamente que el predicado propuesto no coincide con la cláusula WHERE de la vista `public_catalog_parts`, la cual incluye `availability_status IN ('AVAILABLE', 'PENDING_CONFIRMATION')`. Por tanto, el optimizador de PostgreSQL no podría utilizar dicho índice parcial para consultas sobre la vista.
   - Los índices existentes (`idx_parts_vendor_avail`, `idx_parts_category_avail`, `idx_parts_title_trgm`) son plenamente óptimos para 50 registros. Se pospone la creación de un nuevo índice hasta la fase de escala a > 5.000 piezas con un predicado corregido.

6. **Integración con la Aplicación Móvil:**
   - Verificada la recuperación mediante `BackendCatalogService`:
     - Búsqueda de «CALEFACCION»: recupera honestamente las 3 piezas reales existentes en el catálogo de 50 (Mando Citroën Nemo, Resistencia calefacción, Centralita calefacción).
     - Búsqueda de nueva pieza «ELEVALUNAS» (ref `91032`): recupera ficha con 4 fotos reales, 27,95 EUR y donante.
     - Ordenación por precio ascendente: 27,95 EUR < 32,95 EUR < 42,95 EUR.
     - Aislamiento del segundo proveedor simulado: `MockCatalogService` opera de forma estanca con Desguace Alpha Madrid.

7. **Seguridad y Permisos:**
   - Rol `anon` accede únicamente a `public_catalog_parts` (HTTP 200 con 50 piezas visibles).
   - `anon` denegado en `source_integrations` (HTTP 401), `sync_logs` (HTTP 401) e inserciones en `parts` (HTTP 401).
   - `eurodesguace-sync?action=sync-batch` denegado con HTTP 401 ante llamadas no autorizadas.
   - Límite de servidor de 50 piezas blindado y verificado en tests unitarios.

---

## 2. Cobertura de Pruebas Automatizadas

Se ejecutan **85 pruebas automatizadas** pasando al 100% con Vitest:

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
| `apps/mobile/test/live-backend-integration.test.ts` | 8 | Superado | 11 flujos de usuario contra Supabase Staging en vivo con 50 piezas persistidas |

---

## 3. Instrucciones de Ejecución

### Comprobación de Pruebas y Tipado
```bash
# Ejecutar los 85 tests del monorepo
npm test

# Comprobar tipado TypeScript estricto en core y mobile
npm run typecheck
```

### Ejecutar Sincronización Piloto a Staging
```bash
# Sincronizar lote controlado de hasta 50 piezas
python3 scripts/sync_eurodesguace_pilot.py 50
```

### Iniciar Aplicación Móvil
```bash
# Modo backend conectado a staging
npm run start -w @mobile-marketplace/mobile
```
