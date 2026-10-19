# ADR 004: Lectura Segura de Catálogo Persistido, Separación de Entornos y Desacoplamiento de Mocks

- **Estado:** Aceptado
- **Fecha:** 2026-10-19
- **Decisores:** Principal Full-Stack Engineer / Backend Architect / QA Lead

---

## 1. Contexto y Problema

En las fases anteriores se desarrolló el dominio canónico en `packages/core`, el adaptador de producción para Eurodesguace Málaga, y la sincronización con Supabase. Sin embargo, la aplicación móvil Expo dependía de una constante estática de cinco piezas (`EURODESGUACE_REAL_SAMPLE_PARTS`) incrustada dentro de `MockCatalogService`.

Para alcanzar un flujo end-to-end verificable (API real -> adaptador -> normalización -> Supabase -> servicio de catálogo -> app móvil) se requiere:
1. Una persistencia relacional que soporte todos los campos del proveedor (incluyendo `codvehiculo`, referencias visuales diferenciadas de OEM, fotos ordenadas y marcas de sincronización).
2. Un mecanismo de lectura desde la aplicación móvil que consulte datos reales persistidos en backend sin exponer credenciales privadas ni secretos del desguace.
3. Un desacoplamiento estricto que permita ejecutar tests y desarrollo offline con mocks, sin que la aplicación en modo real dependa de datos hardcodeados ni mezcle datos ficticios con inventario real.

---

## 2. Opciones Evaluadas para la Lectura del Catálogo

### Opción A: Consulta PostgREST directa sobre una Proyección Pública Segura (`public_catalog_parts`) protegida por RLS
- **Mecanismo:** La base de datos expone una vista relacional en el esquema público (`public_catalog_parts`) que agrega piezas, vehículos donantes, referencias OEM/visuales e imágenes, junto con los metadatos públicos del vendedor. El acceso está restringido por políticas de Row Level Security (RLS) en las tablas base y concedido únicamente en modo `SELECT` al rol anónimo (`anon`) y autenticado (`authenticated`).
- **Ventajas:**
  - Latencia mínima: sin cold starts asociados a la invocación de funciones serverless.
  - Filtrado y paginación declarativa nativa (`order=`, `ilike.*`, `price_cents=lte.`, `limit=`).
  - No expone credenciales privadas: las tablas `source_integrations`, `sync_logs` y los datos bancarios o fiscales privados de `vendors` quedan inaccesibles al cliente móvil.
- **Desventajas:**
  - Requiere un mapeador en el cliente (`mapRowToPart`, `mapRowToVendor`) para transformar las filas JSON de la vista en entidades canónicas de dominio.

### Opción B: Edge Function dedicada (`catalog-read` / `catalog-search`)
- **Mecanismo:** Una función Deno/TypeScript intermedia en Supabase que recibe las peticiones de búsqueda, consulta la base de datos interna y devuelve directamente el payload con la estructura `Part` y `Vendor`.
- **Ventajas:**
  - El cliente móvil recibe un payload idéntico al dominio sin mapeos intermedios.
- **Desventajas:**
  - Penalización por latencia de arranque en frío (cold start de 200-400 ms en capa de servidor sin uso constante).
  - Duplicación de lógica de filtrado y ordenación entre la función y PostgreSQL.
  - Coste computacional adicional innecesario para operaciones de lectura pública.

---

## 3. Decisión Adoptada

Se adopta la **Opción A**: Consulta PostgREST sobre la proyección pública segura `public_catalog_parts`.

### Justificación Técnica:
1. **Rendimiento y Escalabilidad:** El catálogo de recambios requiere respuestas sub-100ms en autocompletado y listados. PostgREST resuelve la consulta directamente contra los índices de PostgreSQL sin sobrecarga de runtime serverless.
2. **Seguridad Robusta por Diseño:** La vista `public_catalog_parts` filtra automáticamente piezas en estado de baja lógica (`p.deleted_at IS NULL`), piezas agotadas y vendedores no activos o no verificados (`v.status = 'ACTIVE' AND v.cat_verified = true`). La clave `anon` de Supabase es de lectura restringida y nunca tiene acceso a `source_integrations` ni claves de API de los CATs.
3. **Desacoplamiento Limpio:** Se introduce `BackendCatalogService` implementando `ICatalogService`. La selección entre modo mock y backend se gestiona mediante una factoría explícita (`createCatalogService`) controlada por `EXPO_PUBLIC_CATALOG_DATA_SOURCE`. En ningún caso se ocultan fallos de red devolviendo datos simulados en modo real (principio Fail Fast).

---

## 4. Consecuencias

### Positivas
- Los tests unitarios e integrados continúan ejecutándose de forma determinista y sin red mediante `MockCatalogService`.
- En modo backend, la aplicación consume piezas reales sincronizadas en Supabase con persistencia de `donorVehicleCode`, referencias visuales explícitas y orden de imágenes.
- Cumplimiento estricto de las directrices de seguridad: cero secretos en el bundle de Expo.

### Mitigaciones
- Si el backend no está disponible y la app está configurada con `EXPO_PUBLIC_CATALOG_DATA_SOURCE="backend"`, la aplicación lanza un error estructurado visible (`BackendCatalogError`) para que la interfaz muestre el estado de error correspondiente sin falsear el inventario.
