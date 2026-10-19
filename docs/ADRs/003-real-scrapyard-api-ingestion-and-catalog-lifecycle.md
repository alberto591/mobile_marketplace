# ADR 003: Arquitectura de Ingesta Segura de APIs de Desguaces, Ciclo de Vida del Catálogo y Gestión de Disponibilidad

- **Estado:** Propuesto (Pendiente de documentación técnica del primer proveedor real)
- **Fecha:** 2026-10-19
- **Decisores:** Senior Backend Engineer / Principal Software Architect / Product Lead

---

## 1. Contexto y Problema

El Paso 4 del proyecto requiere sustituir el primer adaptador simulado (`MockScrapYardAAdapter`) por una integración con una API real de un Centro Autorizado de Tratamiento (CAT), preservando simultáneamente el funcionamiento del segundo adaptador simulado (`MockScrapYardBAdapter`) y el contrato de servicio consumido por la aplicación móvil (`ICatalogService`).

Tras auditar exhaustivamente el repositorio, se constata que:
1. No existe documentación técnica oficial (Swagger/OpenAPI, colección Postman ni manual de integración) para el primer desguace dentro del espacio de trabajo.
2. Los contratos de dominio vigentes (`ScrapYardAdapter`, `Part`, `ProductIdentity`) y el esquema relacional (`supabase/migrations/20261019000000_canonical_catalog_schema.sql`) están preparados para la ingesta, pero no se deben inventar endpoints ni esquemas de respuesta supuestos.
3. Se requiere definir las políticas no negociables de seguridad, ciclo de vida del inventario y tolerancia a fallos antes de ejecutar la integración física.

---

## 2. Decisiones de Arquitectura y Seguridad

### 2.1 Aislamiento Estricto de Secretos en el Backend
- **Regla:** Ninguna credencial de proveedor (API keys, tokens Bearer, usuarios/contraseñas de autenticación básica) debe residir en el código fuente de la aplicación móvil (`apps/mobile`) ni en variables de entorno accesibles al cliente (`EXPO_PUBLIC_*`).
- **Implementación:** La comunicación con las APIs de los desguaces se ejecuta exclusivamente en el backend (Supabase Edge Functions o servicio de sincronización en servidor). La aplicación móvil consume únicamente la API canónica del marketplace o el servicio de catálogo intermediado.

### 2.2 Idempotencia y Deduplicación en Base de Datos
- **Restricción Unívoca:** Toda pieza importada se persiste garantizando la restricción única `(vendor_id, external_part_id)`.
- **Estrategia UPSERT:** Las sincronizaciones periódicas realizan operaciones de inserción con actualización (`ON CONFLICT (vendor_id, external_part_id) DO UPDATE`), actualizando precio, estado de disponibilidad y marca temporal de verificación (`last_verified_at`) sin duplicar registros ni romper identificadores canónicos previamente referenciados en búsquedas.

### 2.3 Protocolo de Ciclo de Vida y Desaparición de Piezas (Anti-Drop Accidental)
- **Problema:** Una pieza puede desaparecer temporalmente de una respuesta debido a errores de red, paginación truncada, o porque el desguace filtra registros en mantenimiento. Eliminar inmediatamente (`DELETE`) una pieza del catálogo provocaría rotura de enlaces, pérdida de trazabilidad y errores 404 en el cliente móvil.
- **Protocolo de Estados de Ciclo de Vida:**
  1. `ACTIVE`: Pieza confirmada en la última sincronización exitosa y disponible para la venta.
  2. `PENDING_STOCK_VERIFICATION`: Pieza no detectada en la última sincronización completa. Se mantiene visible con advertencia ("Disponibilidad pendiente de reconfirmación") durante una ventana de gracia configurable (por ejemplo, 48 horas).
  3. `OUT_OF_STOCK` / `UNAVAILABLE`: Tras superar la ventana de gracia sin reaparición o tras confirmación explícita de venta/baja por la API, la pieza se marca como no disponible.
  4. **Prohibición de Borrado Físico:** Nunca se ejecuta `DELETE` destructivo sobre piezas sincronizadas históricamente; se preserva la trazabilidad legal exigida por el RD 265/2021.

### 2.4 Manejo Seguro de Imágenes
- Las URLs de fotografías procedentes del proveedor deben ser validadas contra esquemas estrictos (`https://`).
- Si el proveedor restringe el acceso por IP, requiere cabeceras personalizadas de autenticación o sus URLs caducan rápidamente, las imágenes deben descargarse y almacenarse en Supabase Storage con redimensionado optimizado para dispositivos móviles.

### 2.5 Resiliencia y Fallo Visible (Fail Fast, No Mock en Producción)
- Si la API del primer desguace experimenta caídas, sobrecarga (HTTP 429) o fallos de red:
  - El sistema registra el error estructurado con código HTTP, duración y mensaje (sin volcar credenciales ni tokens en los logs).
  - La sincronización aborta la transacción o el lote de forma segura sin corromper el estado anterior.
  - La aplicación móvil recibe el estado real del proveedor caído en `providerErrors`, informando al usuario con transparencia sin ocultar el fallo con datos simulados ni bloquear el inventario de los desguaces que siguen operativos.

---

## 3. Estado de Activación y Puerta de Decisión (Decision Gate)

La implementación del código del adaptador de producción (`packages/core/src/adapters/provider-a.adapter.ts` o la Edge Function correspondiente) queda pausada hasta recibir los datos técnicos oficiales indicados en la auditoría técnica.

---

## 4. Consecuencias

### Positivas
- Se garantiza la seguridad del sistema al evitar la fuga de credenciales al frontend.
- Se previene la corrupción del catálogo ante cortes temporales de los servidores de los desguaces.
- Se mantiene el funcionamiento ininterrumpido del Desguace Beta y del servicio de búsqueda móvil.
