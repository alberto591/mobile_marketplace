# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-19
- **Fase activa:** Fase 2 — Integración de Desguaces Reales (Paso 5 Completado: Catálogo Persistente, Sincronización Segura y Flujo End-to-End)
- **Estado de pruebas:** 69 pruebas automatizadas pasando al 100% (50 en `@mobile-marketplace/core`, 19 en `@mobile-marketplace/mobile`)
- **Compilación móvil:** Bundle iOS para Hermes compilado y verificado con éxito (1.192 módulos empaquetados sin errores)
- **Vulnerabilidades en dependencias:** 0 vulnerabilidades en `@mobile-marketplace/core`

---

## 1. Resumen Ejecutivo del Estado

Se ha completado con éxito el **Paso 5 — Catálogo Persistente y Flujo End-to-End**:

1. **Refinamientos de Persistencia y Migración Canónica:**
   - Migración [supabase/migrations/20261019000002_catalog_persistence_refinements.sql](supabase/migrations/20261019000002_catalog_persistence_refinements.sql) que añade soporte para `donor_vehicle_code` en `part_vehicles`, `reference_type` (`OEM_OFFICIAL`, `REFERENCIA_VISUAL`, `CATALOGO_PROVEEDOR`, `CROSS_REFERENCE`) en `part_oem_references`, y `deleted_at` para bajas lógicas en `parts`.
   - Proyección pública segura `public_catalog_parts` protegida por RLS que agrega las piezas no eliminadas y vendedores activos sin exponer secretos de integración ni tablas administrativas.
2. **Motor de Sincronización Idempotente:**
   - Implementado `EurodesguaceSyncEngine` en `packages/core/src/adapters/eurodesguace/eurodesguace-sync-engine.ts`.
   - Orquesta lotes con cursor (`sig_refid`), validación Zod, normalización canónica, upsert idempotente y gestión de bajas lógicas sin borrado destructivo.
   - Si una petición intermedia falla, el motor aborta el lote sin avanzar indebidamente el cursor.
3. **Servicio de Catálogo Backend y Desacoplamiento de Mocks:**
   - Implementado `BackendCatalogService` en `apps/mobile/services/backend-catalog.service.ts` implementando el contrato `ICatalogService`. Consulta la vista `public_catalog_parts` vía PostgREST con la clave anon pública.
   - En caso de caída de backend o red en modo real, el servicio lanza `BackendCatalogError` (Fail Fast) sin encubrir fallos con datos simulados.
   - Factoría `createCatalogService` en `apps/mobile/services/catalog-service.factory.ts` que permite seleccionar explícitamente entre `mock` y `backend` vía variable de entorno `EXPO_PUBLIC_CATALOG_DATA_SOURCE`.
   - `MockCatalogService` desacoplado: las muestras de Eurodesguace se pueden habilitar/deshabilitar limpiamente mediante opciones.
4. **Ficha de Recambio y Búsqueda Segura:**
   - Visualización de `donorVehicleCode` ("Código vehículo donante").
   - Las referencias visuales (`refvisual`) se aíslan explícitamente y nunca otorgan compatibilidad garantizada (`isGuaranteed: false`).
   - Advertencia de stock en ficha técnica informando que el catálogo del CAT se actualiza diariamente y la disponibilidad física final requiere confirmación del vendedor.
5. **Decisión de Arquitectura Documentada:**
   - [docs/ADRs/004-backend-catalog-persistence-and-secure-client-access.md](docs/ADRs/004-backend-catalog-persistence-and-secure-client-access.md).

---

## 2. Componentes de la Aplicación Móvil (`apps/mobile`)

### Rutas de Expo Router (`apps/mobile/app`)
- **`app/_layout.tsx`:** Navegador Stack principal con barra de estado y estilos acordes a la identidad visual automovilística.
- **`app/index.tsx`:** Pantalla de inicio con formulario estructurado de búsqueda multimodal y sugerencias rápidas.
- **`app/results.tsx`:** Pantalla de resultados con filtros interactivos por desguace (Eurodesguace Málaga, Desguace Alpha, Desguaces Beta), disponibilidad en stock y ordenación determinista.
- **`app/part/[id].tsx`:** Ficha técnica de pieza con galería de fotos reales de Eurodesguace, distinción visual de referencias, código donante `donorVehicleCode`, datos mecánicos del donante y advertencia honesta de stock sujeto a verificación diaria en CAT.

### Componentes de Presentación (`apps/mobile/components`)
- **`CompatibilityBadge`:** Comunica con rigor técnico la compatibilidad de la pieza (garantizado sólo con OEM oficial idéntico).
- **`PartCard`:** Tarjeta de recambio con soporte para piezas con múltiples fotografías, sin foto o con donantes parciales.
- **`InquiryModal`:** Modal de consulta estructurada y solicitud de disponibilidad sin pasarelas ficticias de pago.
- **`EmptyState`:** Estado visual cuando una búsqueda o filtro devuelve 0 resultados.

### Servicios e Integración (`apps/mobile/services`)
- **`ICatalogService`:** Contrato canónico de consulta preservado al 100%.
- **`BackendCatalogService`:** Consulta la proyección `public_catalog_parts` en Supabase con RLS y mapeo a tipos de dominio.
- **`MockCatalogService`:** Servicio de desarrollo local y pruebas offline con soporte para proveedores A y B y muestras opcionales de Eurodesguace.
- **`catalogService`:** Singleton obtenido de la factoría según `EXPO_PUBLIC_CATALOG_DATA_SOURCE`.

---

## 3. Cobertura de Pruebas Automatizadas

Se ejecutan **69 pruebas automatizadas** pasando al 100% con Vitest:

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
| `apps/mobile/test/catalog-service.test.ts` | 12 | Superado | Agregación multi-proveedor, filtrado por Eurodesguace Málaga, referencias visuales |
| `apps/mobile/test/backend-catalog-service.test.ts` | 7 | Superado | Consulta PostgREST, headers anon, filtros, OEM vs visual, getPartById, Fail Fast, factoría |

---

## 4. Instrucciones para Ejecución Local

### Comprobación de Pruebas y Tipado
```bash
# Ejecutar los 69 tests del monorepo
npm test

# Comprobar tipado TypeScript estricto en core y mobile
npm run typecheck
```

### Ejecutar Verificación en Vivo de la API de Eurodesguace
```bash
python3 scripts/test_eurodesguace_connection.py
```

### Iniciar la Aplicación Móvil con Expo
```bash
# Iniciar servidor de desarrollo Metro
npm run start --workspace=@mobile-marketplace/mobile
```

---

## 5. Próximos Pasos (Fase 3: Persistencia en Supabase y Segundo Proveedor Real)

1. Conexión de Supabase CLI con proyecto de desarrollo local (`supabase start`) y aplicación de migraciones `20261019000000` y `20261019000001`.
2. Ejecución de la primera sincronización por lotes controlada (500 piezas) hacia la base de datos de desarrollo.
3. Sustitución de Desguaces Beta (segundo proveedor simulado) cuando se disponga de la documentación de su API.
