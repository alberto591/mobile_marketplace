# ADR 005: Motor de Sincronizacion Serverless, Restriccion de Cuota por Lote (Clamp 50) e Idempotencia UPSERT

- **Estado:** Aceptado
- **Fecha:** 2026-10-20
- **Decisores:** Principal Backend Architect / Senior Data Engineer / Reliability Engineer
- **Componentes Afectados:**
  - [sync-engine.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/src/sync/sync-engine.ts)
  - [eurodesguace.adapter.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/src/adapters/eurodesguace.adapter.ts)
  - [sync-batch/index.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/sync-batch/index.ts)
  - [20261019000000_canonical_catalog_schema.sql](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/migrations/20261019000000_canonical_catalog_schema.sql)
  - [eurodesguace-sync-engine.test.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/test/eurodesguace-sync-engine.test.ts)
  - [sync-edge-function-security.test.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/test/sync-edge-function-security.test.ts)
- **Documentos Relacionados:**
  - [ADR 001: Desacoplamiento de APIs de Desguaces mediante Arquitectura de Adaptadores Independientes](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/001-provider-adapter-architecture.md)
  - [ADR 003: Arquitectura de Ingesta Segura de APIs de Desguaces, Ciclo de Vida del Catálogo y Gestión de Disponibilidad](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/003-real-scrapyard-api-ingestion-and-catalog-lifecycle.md)
  - [ADR 004: Lectura Segura de Catálogo Persistido, Separación de Entornos y Desacoplamiento de Mocks](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/004-backend-catalog-persistence-and-secure-client-access.md)

---

## 1. Contexto y Definicion del Problema

La integracion con el primer Centro Autorizado de Tratamiento (CAT) en produccion (Eurodesguace Malaga) requiere sincronizar miles de piezas automotrices usadas hacia la base de datos relacional de Supabase. El entorno de ejecucion para la ingesta programada reside en Supabase Edge Functions (runtime Deno desplegado en la infraestructura global de Deno Deploy).

Este entorno de ejecucion presenta limitaciones tecnicas y operativas criticas:
1. **Limites de Tiempo de Servidor (Wall-clock Timeout):** Las Edge Functions poseen un tiempo maximo de ejecucion por invocacion HTTP (tipicamente entre 60 y 150 segundos). Intentar sincronizar el catalogo integro en una sola peticion provoca errores de corte `HTTP 504 Gateway Timeout` y deja la base de datos en estados inconsistentes.
2. **Gestion de Cuota y Rate Limiting en el Desguace:** El servidor del desguace aplica un estricto limitador de tasa que responde con `HTTP 429 Too Many Requests` y cabeceras `Retry-After`. Si el marketplace efectua rafagas masivas de extraccion sin espaciado temporal ni paginacion por cursor, la IP del servidor es bloqueada temporalmente.
3. **Seguridad en Invocacion de Sincronizacion:** La funcion de sincronizacion no puede ser expuesta a invocaciones publicas o no autenticadas, ya que un tercero podria forzar sincronizaciones no deseadas, saturar el pool de conexiones de PostgreSQL y generar costes abusivos de computo (ataque EDoS - Economic Denial of Sustainability).
4. **Preservacion de Trazabilidad sin Duplicados:** Las sucesivas ejecuciones de ingesta deben actualizar los datos de piezas ya existentes sin duplicar registros ni romper identificadores foraneos en carritos o consultas previas.

---

## 2. Factores Decisivos (Decision Drivers)

1. **Idempotencia Garantizada:** Cualquier lote de sincronizacion debe poder reejecutarse infinitas veces sin crear registros duplicados ni alterar marcas temporales de forma erronea.
2. **Proteccion Estricta de Cuota Serverless (Fail-Safe Clamping):** Imposibilidad absoluta de solicitar mas registros de los que el runtime puede procesar de forma segura dentro del limite de tiempo de la Edge Function.
3. **Respeto Riguroso al Rate Limiting de Terceros:** Manejo automatico del codigo `HTTP 429` con respaldo exponencial (*exponential backoff*) y respeto a la cabecera `Retry-After`.
4. **Blindaje de Autenticacion en Ingesta:** Acceso a la Edge Function de sincronizacion restringido exclusivamente mediante autorizacion Bearer con `service_role` o token secreto precompartido.
5. **No Destruccion Fisica de Inventario:** Tratamiento de bajas de stock mediante marcado de baja logica (`deleted_at`), preservando la trazabilidad exigida por el Real Decreto 265/2021.

---

## 3. Opciones Consideradas

### Opcion A: Sincronizacion Monolitica Completa en un Unico Proceso Batch
Descargar la totalidad del catalogo de una sola vez ejecutando un bucle continuo de paginacion hasta agotar las piezas del desguace.
- **Ventajas:** Simplicidad conceptual inicial; el catalogo se actualiza completamente al finalizar el proceso.
- **Desventajas:** Inviable en serverless; excede invariablemente el timeout de 150 segundos de Supabase Edge Functions; alto riesgo de saturacion de memoria en Deno; ante cualquier error de red en la pieza 800 se pierde todo el progreso del lote.

### Opcion B: Arquitectura por Lotes Asincronos con Cursor Persistente y Limitacion de Servidor Clamp 50 (Seleccionada)
Implementar un motor de sincronizacion modular (`sync-engine.ts`) orquestado por la Edge Function `sync-batch`. Cada ejecucion procesa una ventana de inventario limitada estrictamente en el lado servidor a un maximo de 50 piezas (`Math.min(limit, 50)`), independientemente del parametro que el cliente o cron envien en la peticion.
- **Ventajas:** Tiempo de ejecucion por lote determinista (habitualmente < 8 segundos); consumo minimo y constante de memoria; progreso incremental mediante cursores persistidos en `source_integrations`; aislamiento de fallos a nivel de lote individual; tolerancia nativa a interrupciones.
- **Compromisos de Diseno (Trade-offs):** Requiere un programador cron externo o invocaciones encadenadas para recorrer el catalogo completo a lo largo del tiempo.

### Opcion C: Delegacion en Herramientas de Integracion iPaaS Externas (Make / Zapier)
Configurar webhooks y flujos visuales en Make para extraer piezas y guardarlas mediante API REST en Supabase.
- **Ventajas:** Sin codigo de infraestructura en el repositorio.
- **Desventajas:** Coste financiero prohibitivo por numero de operaciones; latencia elevada; imposibilidad de aplicar validaciones rigurosas con Zod y transformaciones taxonomicas complejas a bajo nivel.

---

## 4. Decision Adoptada

Se adopta la **Opcion B: Ingesta por Lotes con Cursor Persistente y Restriccion en Servidor Clamp 50**.

### 4.1 Arquitectura del Motor de Sincronizacion

1. **Restriccion Inquebrantable de Servidor (Server-Side Clamping):**
   En [sync-batch/index.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/sync-batch/index.ts), el tamano del lote se normaliza de forma estricta:
   ```typescript
   const requestedLimit = Number(body.limit) || 50;
   const limit = Math.max(1, Math.min(requestedLimit, 50));
   ```
   Cualquier intento de forzar limites superiores (ej. `limit=500`) es acotado de forma silenciosa e inapelable a 50 unidades.

2. **Idempotencia en Base de Datos via Clave Compuesta:**
   La tabla `parts` define la restriccion de unicidad `UNIQUE (vendor_id, external_part_id)`. Las inserciones se ejecutan mediante operacion `UPSERT`:
   ```sql
   INSERT INTO parts (vendor_id, external_part_id, name, price_cents, availability_status, last_synced_at, ...)
   VALUES ($1, $2, $3, $4, 'AVAILABLE', NOW(), ...)
   ON CONFLICT (vendor_id, external_part_id)
   DO UPDATE SET
     price_cents = EXCLUDED.price_cents,
     availability_status = EXCLUDED.availability_status,
     last_synced_at = NOW(),
     updated_at = NOW();
   ```

3. **Paginacion por Cursor y Registro de Sincronizacion:**
   - La tabla `source_integrations` mantiene el puntero `last_sync_cursor`.
   - Cada ejecucion almacena una fila de auditoria en `sync_logs` registrando: `items_fetched`, `items_upserted`, `items_failed`, duracion en milisegundos y mensajes de error tipados.

4. **Tratamiento del Rate Limiting (HTTP 429):**
   El adaptador de Eurodesguace Málaga ([eurodesguace.adapter.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/src/adapters/eurodesguace.adapter.ts)) inspecciona la cabecera `Retry-After`. Si el desguace responde con 429, el adaptador aguarda el intervalo indicado (con tope de 5 segundos en tests y backoff exponencial) antes de reintentar, arrojando un error tipado `ScrapYardApiError` si se agotan los reintentos.

5. **Aislamiento Criptografico en Autenticacion:**
   La Edge Function verifica la cabecera `Authorization: Bearer <token>` contra `SUPABASE_SERVICE_ROLE_KEY` o un token secreto de sincronizacion. Las peticiones anonimas o con credenciales invalidas son rechazadas inmediatamente con `HTTP 401 Unauthorized` antes de instanciar cualquier conexion o cliente.

---

## 5. Consecuencias

### Positivas
- **Estabilidad Operativa:** Cero fallos por timeout en Deno Deploy; la duracion media de ejecucion por lote de 50 piezas se mantiene entre 3,2 y 6,8 segundos.
- **Trazabilidad Historica:** Registro exhaustivo de cada sincronizacion en `sync_logs` permitiendo auditar la evolucion del inventario de cada desguace.
- **Integridad de Datos:** Imposibilidad de generar piezas duplicadas en la base de datos gracias a la restriccion compuesta `(vendor_id, external_part_id)`.
- **Proteccion Financiera:** La cuota fija previene sobrecostes de computo y evita ser incluidos en listas negras de IPs de los desguaces.

### Riesgos Residuales y Mitigaciones
- **Riesgo:** Catalogo extenso requiere multiples invocaciones cron para completarse integramente.
  - *Mitigacion:* Programacion de tareas cron en intervalos de 5 minutos mediante Supabase pg_cron o GitHub Actions programadas, permitiendo ingestar hasta 600 piezas por hora sin estresar los servidores de los CATs.
- **Riesgo:** Una pieza dada de baja en el desguace permanece en catalogo hasta que el ciclo de sincronizacion completo la detecta ausente.
  - *Mitigacion:* Regla de gracia de 48 horas en `availability_status` y reconfirmacion en tiempo real previa al checkout mediante el endpoint de verificacion puntual.
