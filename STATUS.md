# Estado del Proyecto: Marketplace de Recambios de Desguace

- **Fecha de actualización:** 2026-10-19
- **Fase activa:** Fase 1 — Primera Aplicación Móvil Funcional (Paso 3 completado)
- **Estado de pruebas:** 44 pruebas automatizadas pasando al 100% (34 en `@mobile-marketplace/core`, 10 en `@mobile-marketplace/mobile`)
- **Compilación móvil:** Bundle iOS para Hermes compilado y verificado con éxito (1.184 módulos empaquetados sin errores)
- **Vulnerabilidades en dependencias:** 0 vulnerabilidades en `@mobile-marketplace/core`

---

## 1. Resumen Ejecutivo del Estado

Se ha completado el desarrollo de la primera versión navegable de la aplicación móvil en `apps/mobile` utilizando Expo, React Native, TypeScript estricto y Expo Router, consumiendo directamente la capa de dominio canónico `@mobile-marketplace/core`.

La aplicación implementa un flujo completo y verificado de:
1. **Búsqueda multimodal:** por nombre/categoría de recambio, por referencia OEM oficial y por marca/modelo/año del vehículo.
2. **Listado de resultados multi-desguace:** alimentado por los adaptadores de Desguace Alpha (Madrid) y Desguace Beta (Valencia), con filtros interactivos de vendedor, precio y disponibilidad, ordenación determinista y distinción honesta de ofertas distintas que comparten la misma referencia OEM.
3. **Ficha técnica del recambio:** con carrusel de fotografías reales, precio con desglose de IVA, especificaciones técnicas del vehículo donante, identificación oficial del CAT vendedor con autorización ambiental y política de garantías (1 año legal), y acción honesta para consultar disponibilidad (lead sin fingir checkout inmediato).

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

## 5. Bloqueos y Decisiones Técnicas Pendientes

Para la transición a datos de producción (Fase 2 y 3):

1. **Credenciales y documentación Swagger/OpenAPI:** de los dos desguaces iniciales para sustituir los mocks por conectores HTTP reales en Supabase Edge Functions.
2. **Capacidad transaccional:** determinar si alguno de los dos centros soporta reserva atómica vía API o si el modelo de leads/solicitudes estructuradas operará en el lanzamiento comercial.
3. **Hotlinking de imágenes:** confirmar si las URLs de fotografías de las APIs son permanentes con soporte CORS o si se sincronizarán en Supabase Storage.
