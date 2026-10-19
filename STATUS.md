# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-19
- **Fase activa:** Fase 1 — Catálogo Canónico y Dominio Desacoplado (Paso 2 completado)
- **Estado de pruebas:** 33 pruebas unitarias y de integración pasando al 100% (duración: 288 ms)
- **Vulnerabilidades de dependencias:** 0 vulnerabilidades (auditado por npm)

---

## 1. Resumen Ejecutivo del Estado

Se ha completado la implementación de la capa de dominio canónico e integración desacoplada (`@mobile-marketplace/core`), independiente de Supabase, Expo y las APIs propietarias externas.

El sistema cuenta con contratos formales de adaptador, validación en tiempo de ejecución con Zod, motor de evaluación honesta de compatibilidad, preservación estricta de ofertas multi-desguace y el diseño relacional canónico para PostgreSQL/Supabase con políticas de Row Level Security (RLS).

---

## 2. Componentes Implementados y Operativos

### Capa de Dominio Canónico (`packages/core/src/domain`)
- **`Money`:** Objeto de valor expresado en centavos enteros para eliminar deriva por coma flotante, formateador para España y operaciones aritméticas seguras.
- **`Availability`:** Máquina de estados explícita (`AVAILABLE`, `OUT_OF_STOCK`, `RESERVED`, `PENDING_CONFIRMATION`, `WITHDRAWN`) con guardas de compra directa frente a solicitud previa (lead).
- **`OEMReference`:** Normalizador estricto (eliminación de espacios, guiones, puntos y barras; mayúsculas; longitud mínima) y comparador de equivalencia.
- **`Vehicle`:** Especificaciones del vehículo donante (marca, modelo, generación, años, código de motor, combustible, cilindrada, potencia y bastidor anonimizado).
- **`CompatibilitySignal`:** Motor de compatibilidad con 4 niveles de confianza. Garantiza que la coincidencia de marca/modelo/año **NUNCA** afirme compatibilidad garantizada sin referencia OEM verificada.
- **`Vendor`:** Entidad con requisitos legales españoles para Centros Autorizados de Tratamiento (código de autorización CAT, garantía mínima de 12 meses y política de devolución).
- **`InventorySource`:** Trazabilidad inmutable de origen mediante clave compuesta `providerId::externalPartId`.
- **`Part`:** Entidad raíz de inventario. Cada recambio representa una unidad física única; queda prohibido fusionar o colapsar piezas de distintos desguaces.
- **`ProductIdentity`:** Proyección de lectura agregada que agrupa ofertas de múltiples desguaces por referencia OEM sin mutar las piezas subyacentes (ADR 002).

### Puerto de Integración (`packages/core/src/ports`)
- **`ScrapYardAdapter`:** Puerto hexagonal con modelo de capacidades declaradas (`ProviderCapabilities`): disponibilidad en tiempo real opcional, sincronización incremental, soporte de imágenes y límites de tasa.
- **`CatalogSyncEnginePort`:** Contratos para ejecución de sincronizaciones por lotes con registro de altas, actualizaciones, bajas y errores estructurados.

### Validación en Tiempo de Ejecución (`packages/core/src/validation`)
- Esquemas Zod para todas las entidades y entradas externas.
- `NormalizationError` estructurado con desglose de rutas de fallo y valores recibidos. No se descartan silenciosamente registros ni se sustituyen por datos ficticios.

### Fixtures y Mocks de Desarrollo (`packages/core/src/fixtures`)
- **Provider A (Desguace Alpha):** Simulación de API con nombres en castellano. Incluye piezas completas, campos opcionales ausentes, oferta compartida con Provider B, compatibilidad no verificada, producto sin fotos, pieza agotada, respuesta paginada y payload corrupto para probar fallos.
- **Provider B (Desguace Beta):** Simulación de API estilo REST/inglés con capacidad de consulta de stock en tiempo real.
- **Mock Adapters:** `MockScrapYardAAdapter` y `MockScrapYardBAdapter` implementando `ScrapYardAdapter`.

### Persistencia y Seguridad (`supabase/migrations`)
- Migración versionada `20261019000000_canonical_catalog_schema.sql`:
  - Tablas: `vendors`, `source_integrations`, `parts`, `part_vehicles`, `part_oem_references`, `part_images`, `sync_logs`.
  - Clave de idempotencia única `(vendor_id, external_part_id)`.
  - Índices B-Tree en identificadores, disponibilidad y categorías.
  - Índices GIN con `pg_trgm` en títulos y referencias OEM para búsquedas tolerantes a erratas.
  - Políticas de Row Level Security (RLS) habilitadas en todas las tablas: lectura pública limitada a catálogo disponible y vendedores activos verificados; aislamiento total de secretos de integración y registros para `service_role`.

---

## 3. Cobertura de Pruebas Automatizadas

Se ejecutan 33 pruebas unitarias y de integración mediante Vitest:

| Archivo de Prueba | Casos | Estado | Cobertura Funcional |
|---|---|---|---|
| `test/money.test.ts` | 8 | Superado | Centavos enteros, parsing decimal, formato ES, sumas y comparaciones |
| `test/oem-normalization.test.ts` | 5 | Superado | Limpieza de caracteres, mayúsculas, validación de longitud y equivalencias |
| `test/compatibility-signal.test.ts` | 4 | Superado | `EXACT_OEM_MATCH` garantizado vs `ATTRIBUTES_MATCH` sin garantía y rangos de año |
| `test/validation-and-errors.test.ts` | 3 | Superado | Validación Zod positiva, rechazo de negativos/inválidos y normativas CAT |
| `test/duplicate-and-traceability.test.ts` | 3 | Superado | Aislamiento de clave de origen, preservación multi-oferta y proyección agrupada |
| `test/mock-adapters.test.ts` | 10 | Superado | Paginación, capacidades opcionales, consulta de stock, normalización y 404 |

---

## 4. Decisiones Arquitectónicas Registradas (ADRs)

- [ADR 001](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/001-provider-adapter-architecture.md): Desacoplamiento de APIs de desguaces mediante arquitectura de adaptadores independientes.
- [ADR 002](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/002-product-identity-vs-part-inventory.md): Separación entre Entidad de Inventario (`Part`) y Proyección Agregada de Catálogo (`ProductIdentity`).

---

## 5. Bloqueos y Requerimientos de las APIs Reales para Continuar

Para sustituir los adaptadores simulados por conectores reales de los dos desguaces, se requiere:

1. **Documentación de endpoints y contratos:**
   - Swagger / OpenAPI o colección Postman de cada centro.
   - 5 a 10 ejemplos de payloads JSON reales por proveedor con datos personales eliminados.
2. **Mecanismo de autenticación:**
   - Tipo de credencial (API Key en cabecera, token Bearer con ciclo de expiración o Basic Auth).
3. **Paginación y tasa de refresco:**
   - Método de paginación (offset/limit vs cursor opaco).
   - Disponibilidad de parámetro `updated_since` o necesidad de barrido completo diario.
   - Límites de peticiones por minuto (*rate limit*).
4. **Validación de capacidades transaccionales:**
   - Confirmar si alguna de las dos APIs permite endpoint de verificación de disponibilidad en tiempo real o reserva temporal previa a pedido.
5. **Políticas de imágenes:**
   - Comprobar si las URLs de fotografías permiten hotlinking estable o exigen descarga y custodia en Supabase Storage.

---

## 6. Siguiente Paso Recomendado

Iniciar el **Paso 3**:
- Scaffolding de la aplicación móvil en `apps/mobile` mediante Expo SDK con TypeScript estricto y Expo Router.
- Configurar enlace de consumo con `@mobile-marketplace/core`.
- Implementar la interfaz de usuario de la Fase 1: pantalla de búsqueda, listado de resultados con filtros básicos, badges de compatibilidad honestos y ficha técnica de pieza con fotografías reales y datos del CAT vendedor.
