# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-20
- **Fase completada:** Fase 2 — Paso 9: Congelación de Catálogo en 114 Piezas Reales y Preparación para Validación Manual de Usuario
- **Estado de pruebas:** 85 pruebas automatizadas pasando al 100% (57 en `@mobile-marketplace/core`, 28 en `@mobile-marketplace/mobile`)
- **Tipado estático:** TypeScript estricto (`tsc --noEmit`) superado con 0 errores en core y mobile
- **Compilación móvil:** Bundle iOS para Hermes verificado, configurable en modo `backend` (PostgREST directo a staging) y modo `mock`
- **Proyecto Supabase Staging:** `lmsjgxhzfksyrlxyqndd` (West Europe - Ireland)
- **Repositorio Remoto GitHub:** `https://github.com/alberto591/mobile_marketplace` (rama `main`)

---

## 1. Resumen Ejecutivo del Estado

Se ha auditado y estabilizado el catálogo en **Supabase Staging (`lmsjgxhzfksyrlxyqndd`)**, congelando formalmente el inventario en 114 piezas para permitir la validación manual del usuario:

1. **Congelación Estricta del Inventario:**
   - La ingesta de datos queda **temporalmente congelada** en las **114 piezas únicas** existentes.
   - Prohibidas nuevas inserciones, actualizaciones masivas, migraciones o alteraciones de cursor hasta recibir el feedback formal de las pruebas manuales.
   - El punto de control en `source_integrations` permanece intacto en `last_cursor: '111'`, `sync_status: 'IDLE'`.

2. **Auditoría de Datos en Supabase Staging:**
   - **Piezas únicas (`parts`):** 114 registros persistidos vinculados a Eurodesguace Málaga S.L. (`00000000-0000-4000-a000-000000000101`).
   - **Unicidad e Identificadores:** 114/114 identificadores externos (`external_part_id`) únicos, sin duplicados ni colisiones.
   - **Fotografías Reales (`part_images`):** 378 imágenes registradas y asociadas a las piezas persistidas (media de 3,32 fotos por pieza con URLs de CDN en alta resolución).
   - **Vehículos Donantes (`part_vehicles`):** 112 vínculos con marca, modelo y código de vehículo donante (`donor_vehicle_code`).
   - **Referencias Visuales (`part_oem_references`):** 102 referencias tipadas al 100% como `REFERENCIA_VISUAL` (no garantizada).
   - **Integridad Referencial:** 0 registros huérfanos.

3. **Auditoría de Configuración Móvil (Modo Backend):**
   - La variable `EXPO_PUBLIC_CATALOG_DATA_SOURCE=backend` activa deterministamente `BackendCatalogService`.
   - La aplicación consume la vista PostgREST `public_catalog_parts` mediante la clave pública anónima (`EXPO_PUBLIC_SUPABASE_ANON_KEY`).
   - El bundle móvil está 100% libre de claves privadas (`EURODESGUACE_API_KEY`, `SYNC_ADMIN_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`).
   - Principio Fail-Fast: Si el backend falla, la app muestra una pantalla de error explícita con reintento. Jamás inyecta fixtures ni inventario simulado.
   - Transparencia en consultas: El modal `InquiryModal` clarifica de forma honesta que en staging la consulta se registra localmente como prototipo, sin fingir transmisiones externas al CAT.

4. **Guía de Pruebas Manuales Preparada:**
   - Creado el documento `docs/manual-testing-guide.md` con **21 casos de prueba estructurados** (Búsqueda, Resultados, Ficha Técnica, Errores y Usabilidad) con pasos, resultados esperados y casillas de verificación PASS/FAIL/BLOCKED.

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
| `apps/mobile/test/live-backend-integration.test.ts` | 8 | Superado | 11 flujos de usuario contra Supabase Staging en vivo con inventario real |

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
