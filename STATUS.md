# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-19
- **Fase activa:** Fase 2 — Paso 6: Staging, Auditoría de Seguridad y Primera Sincronización Real
- **Estado de pruebas:** 73 pruebas automatizadas pasando al 100% (54 en `@mobile-marketplace/core`, 19 en `@mobile-marketplace/mobile`)
- **Compilación móvil:** Bundle iOS para Hermes compilado y verificado con éxito (1.192 módulos empaquetados sin errores)
- **Vulnerabilidades en dependencias:** 0 vulnerabilidades en `@mobile-marketplace/core`

---

## 1. Resumen Ejecutivo del Estado

Se han completado las **Fases A y B del Paso 6 (Auditoría de Seguridad y Endurecimiento)**:

1. **Auditoría de Seguridad de la Vista Pública y RLS:**
   - Detectada la ausencia de `WITH (security_invoker = true, security_barrier = true)` en la vista previa.
   - Detectada la necesidad de incorporar explícitamente `AND deleted_at IS NULL` en la política RLS de la tabla `parts`.
   - Se implementó la migración correctiva [20261019000003_view_security_hardening.sql](supabase/migrations/20261019000003_view_security_hardening.sql) que:
     - Recrea `public_catalog_parts` con `WITH (security_invoker = true, security_barrier = true)`.
     - Actualiza la política `Public read for available parts` en `parts` forzando `deleted_at IS NULL`.
     - Ejecuta `REVOKE ALL ON source_integrations, sync_logs FROM anon, authenticated, public` garantizando que las credenciales internas y logs de sincronización no sean descubribles por PostgREST.
     - Concede permisos `SELECT` estrictamente de solo lectura a roles `anon` y `authenticated` en las tablas del catálogo.
2. **Protección Administrativa en la Edge Function:**
   - La acción `sync-batch` en [supabase/functions/eurodesguace-sync/index.ts](supabase/functions/eurodesguace-sync/index.ts) ahora exige obligatoriamente autorización administrativa con `service_role` o `SYNC_ADMIN_SECRET` devolviendo HTTP 401 Unauthorized ante llamadas anónimas.
   - Acciones públicas `health` y `sample-parts` sanitizan los datos sin exponer claves de API ni tokens en ningún escenario.
3. **Estado de Staging y Preparación Remota:**
   - Verificado el CLI de Supabase: no existe proyecto de staging vinculado (`supabase link`) ni token de acceso activo.
   - Verificado el entorno local: Docker no se encuentra en ejecución (`DOCKER_NOT_RUNNING`).
   - Cero credenciales filtradas en Git o en el bundle de Expo.
   - Se han documentado las instrucciones no destructivas para vincular el entorno de staging autorizado sin exponer claves de producción.

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

## 3. Instrucciones para Ejecución Local

### Comprobación de Pruebas y Tipado
```bash
# Ejecutar los 73 tests del monorepo
npm test

# Comprobar tipado TypeScript estricto en core y mobile
npm run typecheck
```

### Ejecutar Verificación en Vivo de la API de Eurodesguace
```bash
python3 scripts/test_eurodesguace_connection.py
```

---

## 4. Próximos Pasos para Desbloqueo de Staging (Fases C, D, F)

1. Autenticar CLI en sesión local mediante `npx supabase login`.
2. Vincular proyecto de staging independiente mediante `npx supabase link --project-ref <staging-project-ref>`.
3. Configurar secreto de backend en staging: `npx supabase secrets set EURODESGUACE_API_KEY=...`.
4. Ejecutar simulación `npx supabase db push --dry-run` para validar la aplicación de las 4 migraciones.
5. Tras autorización explícita, ejecutar `npx supabase db push` e importar un lote piloto limitado de 50 piezas para comprobar idempotencia física y lectura en la app móvil.
