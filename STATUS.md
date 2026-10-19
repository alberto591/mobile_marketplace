# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-19
- **Fase activa:** Fase 2 — Integración de Desguaces Reales (Paso 4 Completado: Eurodesguace Málaga API Real, Sincronización y Prueba End-to-End)
- **Estado de pruebas:** 57 pruebas automatizadas pasando al 100% (45 en `@mobile-marketplace/core`, 12 en `@mobile-marketplace/mobile`)
- **Compilación móvil:** Bundle iOS para Hermes compilado y verificado con éxito (1.190 módulos empaquetados sin errores)
- **Vulnerabilidades en dependencias:** 0 vulnerabilidades en `@mobile-marketplace/core`

---

## 1. Resumen Ejecutivo del Estado

Se ha completado con éxito el **Paso 4 — Integración del Primer Desguace Real (Eurodesguace Málaga)**:

1. **Documentación Oficial:** Se ha redactado y versionado la especificación completa en [docs/providers/eurodesguace-malaga-api.md](docs/providers/eurodesguace-malaga-api.md).
2. **Adaptador de Producción:** Implementado en `packages/core/src/adapters/eurodesguace/` (`EurodesguaceAdapter`, `EurodesguaceHttpClient`, `EurodesguaceNormalizer`), respetando estrictamente el contrato canónico `ScrapYardAdapter` y declarando sus capacidades operativas honestas (sin inventar endpoints de stock en tiempo real inexistentes).
3. **Conversión y Normalización Monetaria:** Función `parseEuroCommaToCents` y `createMoneyFromCommaString` que convierten de forma determinista precios con coma decimal (`"42,95"`) a céntimos enteros (4295 cts) sin incurrir en imprecisiones de coma flotante.
4. **Verificación de Conexión en Vivo:**
   - `GET /health`: Respuesta HTTP 200 OK confirmada (`status: ok`, `site: eurodesguacemalaga.com`, `scopes: ['parts:read', 'vehicles:read']`).
   - `GET /parts?limit=5`: Respuesta HTTP 200 OK con 31.357 piezas totales registradas en el catálogo del CAT. Muestra de 5 piezas recuperada, sanitizada y normalizada con éxito.
5. **Seguridad y Confidencialidad:** Las credenciales residen exclusivamente en `supabase/functions/.env` y `.env.local`, excluidas de Git mediante `.gitignore` y verificadas con `git check-ignore`. Cero exposición en frontend Expo ni en variables `EXPO_PUBLIC_*`.
6. **Persistencia e Idempotencia:** Migración [supabase/migrations/20261019000001_eurodesguace_vendor_seed.sql](supabase/migrations/20261019000001_eurodesguace_vendor_seed.sql) para registrar al vendedor oficial y su integración. Supabase Edge Function [supabase/functions/eurodesguace-sync/index.ts](supabase/functions/eurodesguace-sync/index.ts) para orquestar la ingesta en backend.
7. **Integración Móvil Sin Regresiones:** El servicio de catálogo móvil integra a Eurodesguace Málaga manteniendo intacto al segundo proveedor simulado (Desguace Beta Paterna). La ficha de recambio distingue claramente las referencias visuales del CAT frente a referencias OEM oficiales y comunica con honestidad las condiciones de IVA, garantía y disponibilidad.

---

## 2. Componentes de la Aplicación Móvil (`apps/mobile`)

### Rutas de Expo Router (`apps/mobile/app`)
- **`app/_layout.tsx`:** Navegador Stack principal con barra de estado y estilos acordes a la identidad visual automovilística.
- **`app/index.tsx`:** Pantalla de inicio con formulario estructurado de búsqueda multimodal y sugerencias rápidas.
- **`app/results.tsx`:** Pantalla de resultados con filtros interactivos por desguace (Eurodesguace Málaga, Desguace Alpha, Desguaces Beta), disponibilidad en stock y ordenación determinista.
- **`app/part/[id].tsx`:** Ficha técnica de pieza con galería de fotos reales de Eurodesguace, distinción visual de referencias, datos mecánicos del donante y advertencia honesta de stock sujeto a verificación en CAT.

### Componentes de Presentación (`apps/mobile/components`)
- **`CompatibilityBadge`:** Comunica con rigor técnico la compatibilidad de la pieza.
- **`PartCard`:** Tarjeta de recambio con soporte para piezas con múltiples fotografías, sin foto o con donantes parciales.
- **`InquiryModal`:** Modal de consulta estructurada y solicitud de disponibilidad sin pasarelas ficticias.
- **`EmptyState`:** Estado visual cuando una búsqueda o filtro devuelve 0 resultados.

### Servicios e Integración (`apps/mobile/services`)
- **`ICatalogService`:** Contrato de consulta preservado al 100%.
- **`MockCatalogService`:** Servicio híbrido que agrega el catálogo de Eurodesguace Málaga normalizado junto a los proveedores simulados, permitiendo ejecutar tanto pruebas locales sin conexión como navegación con datos reales.

---

## 3. Cobertura de Pruebas Automatizadas

Se ejecutan **57 pruebas automatizadas** pasando al 100% con Vitest:

| Módulo / Archivo | Pruebas | Estado | Cobertura |
|---|---|---|---|
| `packages/core/test/money.test.ts` | 8 | Superado | Centavos enteros, parsing decimal, operaciones seguras |
| `packages/core/test/oem-normalization.test.ts` | 5 | Superado | Limpieza de caracteres, equivalencias y mayúsculas |
| `packages/core/test/compatibility-signal.test.ts` | 5 | Superado | OEM verificado vs donante similar vs discrepancia de coche |
| `packages/core/test/validation-and-errors.test.ts` | 3 | Superado | Esquemas Zod, rechazo de negativos y normativas CAT |
| `packages/core/test/duplicate-and-traceability.test.ts` | 3 | Superado | Aislamiento de origen, preservación multi-desguace y proyección |
| `packages/core/test/mock-adapters.test.ts` | 10 | Superado | Paginación, capacidades opcionales, consulta de stock y 404 |
| `packages/core/test/eurodesguace-adapter.test.ts` | 11 | Superado | Parsing de coma decimal, Zod schemas, 429 Retry-After, cursor, confidencialidad |
| `apps/mobile/test/catalog-service.test.ts` | 12 | Superado | Agregación multi-proveedor, filtrado por Eurodesguace Málaga, referencias visuales |

---

## 4. Instrucciones para Ejecución Local

### Comprobación de Pruebas y Tipado
```bash
# Ejecutar los 57 tests del monorepo
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
