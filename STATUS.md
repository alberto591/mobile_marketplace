# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-19
- **Fase activa:** Fase 2 — Integración de Desguaces Reales (Paso 4: Auditoría de API y Puerta de Decisión)
- **Estado de pruebas:** 44 pruebas automatizadas pasando al 100% (34 en `@mobile-marketplace/core`, 10 en `@mobile-marketplace/mobile`)
- **Compilación móvil:** Bundle iOS para Hermes compilado y verificado con éxito (1.184 módulos empaquetados sin errores)
- **Vulnerabilidades en dependencias:** 0 vulnerabilidades en `@mobile-marketplace/core`

---

## 1. Resumen Ejecutivo del Estado

Se ha completado la auditoría técnica de la Fase A para la integración del primer desguace real en el proyecto. 

Conclusiones de la auditoría:
1. No se encontraron especificaciones OpenAPI/Swagger, colecciones Postman, endpoints ni credenciales reales en el repositorio ni en la documentación para el primer proveedor.
2. Conforme al principio de ingeniería de no inventar endpoints supuestos ni introducir datos simulados que oculten la realidad en producción, la implementación física del adaptador queda pausada en la **Puerta de Decisión (Decision Gate)**.
3. Se formalizó la arquitectura de ingesta, seguridad y ciclo de vida en [ADR 003](docs/ADRs/003-real-scrapyard-api-ingestion-and-catalog-lifecycle.md), estableciendo el aislamiento estricto de secretos en el backend, la idempotencia `(vendor_id, external_part_id)` y el protocolo de no borrado destructivo ante fallos de sincronización.
4. El sistema mantiene el 100% de operatividad en sus 44 pruebas unitarias y de integración, así como la ejecución fluida de la app móvil con los adaptadores desacoplados.

---

## 2. Componentes de la Aplicación Móvil (`apps/mobile`)

### Rutas de Expo Router (`apps/mobile/app`)
- **`app/_layout.tsx`:** Navegador Stack principal con barra de estado y estilos acordes a la identidad visual automovilística.
- **`app/index.tsx`:** Pantalla de inicio con formulario estructurado de búsqueda, sugerencias rápidas ("Faros Golf V", "Radiador Seat", "OEM 1K0121205AD") y tarjetas de confianza legal (RD 265/2021).
- **`app/results.tsx`:** Pantalla de resultados con filtros por desguace, disponibilidad en stock, ordenación (precio asc/desc, relevancia, compatibilidad) y lista de tarjetas interactivas.
- **`app/part/[id].tsx`:** Ficha de producto completa con galería fotográfica, badge detallado de compatibilidad, datos del donante, perfil del CAT y barra inferior flotante de consulta.

### Componentes de Presentación (`apps/mobile/components`)
- **`CompatibilityBadge`:** Comunica con rigor la compatibilidad técnica:
  - `EXACT_OEM_MATCH` verificado: Verde esmeralda.
  - `EXACT_OEM_MATCH` con discrepancia de vehículo: Amarillo advertencia ("OEM coincide · Vehículo difiere").
  - `ATTRIBUTES_MATCH`: Amarillo advertencia ("Coche donante similar · No garantizado").
  - `UNKNOWN_PENDING_CONFIRMATION`: Gris neutro ("Compatibilidad no confirmada").
- **`PartCard`:** Tarjeta de recambio con foto real (o placeholder estilizado cuando no hay foto), precio en formato español, estado de uso, referencia OEM, vehículo donante y datos del CAT vendedor.
- **`InquiryModal`:** Modal de consulta estructurada y solicitud de disponibilidad sin cobros anticipados.
- **`EmptyState`:** Estado visual cuando una búsqueda o filtro devuelve 0 resultados, con acciones claras de recuperación.

### Servicios e Integración (`apps/mobile/services`)
- **`ICatalogService`:** Contrato desacoplado que define la interfaz de búsqueda, obtención por ID y consulta de vendedores, permitiendo sustituir los mocks por endpoints remotos de Supabase en el futuro sin alterar la UI.
- **`MockCatalogService`:** Implementación que consume ambos adaptadores (`MockScrapYardAAdapter` y `MockScrapYardBAdapter`), evalúa la compatibilidad mediante `@mobile-marketplace/core`, aísla errores de proveedores caídos y cachea los resultados para estabilidad de identificadores.

---

## 3. Cobertura de Pruebas Automatizadas

Se ejecutan 44 pruebas automatizadas con Vitest:

| Módulo / Archivo | Pruebas | Estado | Cobertura |
|---|---|---|---|
| `packages/core/test/money.test.ts` | 8 | Superado | Centavos enteros, parsing decimal, operaciones seguras |
| `packages/core/test/oem-normalization.test.ts` | 5 | Superado | Limpieza de caracteres, equivalencias y mayúsculas |
| `packages/core/test/compatibility-signal.test.ts` | 5 | Superado | OEM verificado vs donante similar vs discrepancia de coche |
| `packages/core/test/validation-and-errors.test.ts` | 3 | Superado | Esquemas Zod, rechazo de negativos y normativas CAT |
| `packages/core/test/duplicate-and-traceability.test.ts` | 3 | Superado | Aislamiento de origen, preservación multi-desguace y proyección |
| `packages/core/test/mock-adapters.test.ts` | 10 | Superado | Paginación, capacidades opcionales, consulta de stock y 404 |
| `apps/mobile/test/catalog-service.test.ts` | 10 | Superado | Agregación multi-proveedor, filtrado, ordenación, fotos ausentes y consulta por ID |

---

## 4. Instrucciones para Ejecución Local

### Comprobación de Pruebas y Tipado
```bash
# Ejecutar los 44 tests del monorepo
npm test

# Comprobar tipado TypeScript estricto en core y mobile
npm run typecheck
```

### Iniciar la Aplicación Móvil con Expo
```bash
# Iniciar servidor de desarrollo Metro
npm run start --workspace=@mobile-marketplace/mobile

# O directamente desde la carpeta de la app:
cd apps/mobile && npx expo start
```

### Opciones de visualización:
- **Dispositivo físico (iOS / Android):** Escanear el código QR que muestra Metro utilizando la app gratuita **Expo Go**.
- **Simulador:** Pulsar `i` en la terminal de Metro (requiere Xcode y herramientas de línea de comandos configuradas).

---

## 5. Decision Gate y Requisitos Pendientes (Paso 4)

Para desbloquear la Fase B (implementación del adaptador real en Supabase Edge Functions):

1. **Documentación Oficial de la API del Proveedor 1:**
   - Swagger / OpenAPI (JSON/YAML) o manual técnico en PDF con endpoints exactos.
   - Formato de autenticación (API Key por cabecera, Bearer Token, OAuth2 o Basic Auth).
   - Estructura de respuestas JSON/XML y códigos de error (429, 401, 503).
2. **Modelo de Paginación y Consulta:**
   - Mecanismo de paginación (offset/limit, página/tamaño o cursor opaco).
   - Disponibilidad de parámetros incrementales (`updated_after`, `since_timestamp`).
3. **Mapeo de Campos de Inventario y Vehículos:**
   - Referencia OEM principal y equivalencias.
   - Datos del donante: marca, modelo, año, código de motor, combustible, cilindrada.
   - Moneda, desglose de IVA y formato del precio.
4. **Política de Fotografías:**
   - Estabilidad de las URLs de fotos y requisitos de autorización o CORS.
5. **Comprobación de Stock en Tiempo Real:**
   - Si existe endpoint de verificación previa de stock antes de confirmar solicitudes o si el catálogo es asíncrono.
