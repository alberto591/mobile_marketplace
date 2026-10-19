# Especificación Técnica de API: Eurodesguace Málaga

- **Proveedor:** Eurodesguace Málaga S.L. (Centro Autorizado de Tratamiento)
- **Estado de integración:** Fase B (Adaptador real en backend / Supabase Edge Functions)
- **Fecha de especificación:** 2026-10-19 (Manual de origen: 14 de septiembre de 2026)
- **Versión de API:** `v1`

---

## 1. Configuración General y Acceso

- **Base URL:** `https://eurodesguacemalaga.com/api/v1`
- **Protocolo y Formato:** HTTPS exclusivo (HTTP devuelve `426 https_required`). Carga útil en formato JSON codificado en UTF-8.
- **Métodos HTTP admitidos:** Exclusivamente `GET`. La API es de solo lectura; no admite mutaciones, reservas de piezas ni pasarelas de pago.
- **Autenticación:** En todas las peticiones mediante cabecera HTTP estándar:
  ```http
  Authorization: Bearer <EURODESGUACE_API_KEY>
  ```
  La API no dispone de endpoints públicos. El token debe ser custodiado estrictamente en el entorno backend seguro (`supabase/functions/.env` o variables de entorno del servidor), sin exponerse jamás al frontend cliente.

---

## 2. Catálogo de Endpoints Documentados

| Método | Endpoint | Descripción | Objeto en `data` |
|---|---|---|---|
| `GET` | `/health` | Diagnóstico del servicio, nombre asignado a la clave y ámbitos autorizados. | Metadatos de salud y clave |
| `GET` | `/parts` | Catálogo paginado de recambios con filtros de búsqueda y sincronización incremental. | Array de piezas (`PartDto[]`) |
| `GET` | `/parts/{refid}` | Recupera la ficha técnica y fotos de un recambio por su identificador estable. | Objeto de pieza (`PartDto`) |
| `GET` | `/vehicles` | Catálogo paginado de vehículos donantes descontaminados. | Array de vehículos (`VehicleDto[]`) |
| `GET` | `/vehicles/{codvehiculo}` | Recupera el vehículo donante identificado por su código interno. | Objeto de vehículo (`VehicleDto`) |

---

## 3. Parámetros de Consulta y Filtros

### 3.1 Parámetros Generales de Paginación y Filtrado
- `limit`: Cantidad máxima de registros por página. Valor predeterminado: `100`. Límite máximo admitido: `500`.
- `cursor`: Cursor opaco obtenido de `meta.next_cursor` para consultar la siguiente página.
- `fields`: Lista de campos separados por comas para proyección de atributos.
- `q`: Cadena de búsqueda textual parcial (mínimo 2 caracteres, máximo 100).
- `updated_since`: Marca temporal en formato ISO-8601 (`YYYY-MM-DDTHH:mm:ssZ`) para sincronización incremental.
- `include_deleted=1`: Incluye registros con baja lógica (`deleted_at` informado).

### 3.2 Filtros Específicos para Piezas (`/parts`)
Admiten coincidencia exacta y listas separadas por comas:
- `marca`, `modelo`, `familia`, `articulo`, `codvehiculo`, `refvisual`, `estado`, `ubicacion`, `almacen`, `ean`.

### 3.3 Filtros Específicos para Vehículos (`/vehicles`)
- `marca`, `modelo`, `anoversion`, `codigomotor`, `tipocombustible`, `color`, `codigocambio`, `estadovehiculo`, `localizacion`.

*Nota de integración:* Los parámetros de consulta deben mantenerse invariantes durante la navegación a través de un cursor paginado.

---

## 4. Esquemas de Carga Útil (Payloads)

### 4.1 Respuestas de Listado (`/parts`, `/vehicles`)
```json
{
  "data": [ ... ],
  "meta": {
    "count": 100,
    "limit": 100,
    "next_cursor": "eyJpZCI6MzEyODUsInRzIjoxNzI2MzEwNDAwfQ==",
    "total": 31285
  }
}
```

### 4.2 Respuestas de Detalle (`/parts/{refid}`, `/vehicles/{codvehiculo}`)
El objeto reside directamente bajo la clave `data`, sin el bloque `meta`:
```json
{
  "data": { ... }
}
```

### 4.3 Campos de Recambio (`PartDto`)
- `refid`: (string) Identificador unívoco y permanente de la pieza en el desguace.
- `familia`: (string) Agrupación taxonómica de la pieza.
- `articulo`: (string) Denominación descriptiva del recambio.
- `marca`: (string) Marca del vehículo donante.
- `modelo`: (string) Modelo del vehículo donante.
- `precio`: (string) Precio en formato de texto con coma decimal (ej. `"42,95"` o `"120,00"`). Debe normalizarse a céntimos enteros.
- `peso`: (number | null) Peso estimado o medido en kilogramos.
- `anopieza`: (number | null) Año de fabricación del componente o del vehículo donante.
- `refvisual`: (string | null) Referencia alfanumérica leída sobre la pieza desmontada.
  *Advertencia de dominio:* No debe interpretarse de forma automática como referencia OEM verificada.
- `estado`: (string | null) Estado cualitativo asignado por el operario.
- `codvehiculo`: (string) Clave de relación con el vehículo donante.
- `imgs`: (string[]) Array de URLs de fotografías de la pieza real.
- `deleted_at`: (string | null) Fecha ISO-8601 de baja lógica o venta.
- Metadatos adicionales documentados: `motorversion`, `cambioversion`, `notapublica`, `created_at`, `updated_at`.

### 4.4 Campos de Vehículo Donante (`VehicleDto`)
- `codvehiculo`: (string) Identificador del vehículo en el CAT.
- `marca`: (string) Marca del fabricante.
- `modelo`: (string) Denominación comercial del modelo.
- `anoversion`: (number | null) Año de primera matriculación o versión.
- `kilometraje`: (number | null) Kilometraje verificado en cuadro de mandos al desguazar.
- `imgs`: (string[]) Fotografías del vehículo completo a la entrada en instalaciones.
- `codigomotor`: (string | null) Código técnico de motor (ej. `"BKC"`, `"K9K"`).
- `puertas`: (number | null) Número de puertas.
- `tipocombustible`: (string | null) Tipo de combustible (DIESEL, GASOLINA, etc.).
- `color`: (string | null) Código o nombre de color de carrocería.
- `notapublica`: (string | null) Observaciones mecánicas del donante.
- `codigocambio`: (string | null) Referencia de caja de cambios.
- `deleted_at`: (string | null) Marca temporal de baja definitiva del vehículo.

---

## 5. Cobertura Real Declarada del Catálogo (14-Sep-2026)

- Volumen aproximado: **31.285 piezas activas** y **1.367 vehículos activos**.
- Cobertura universal (100%): `refid`, `familia`, `articulo`, `marca`, `modelo`, `precio`, `peso`, `anopieza`, `imgs`, `codvehiculo`.
- Cobertura parcial:
  - `refvisual`: 92% de las piezas informadas.
  - `notapublica`: 11% de las piezas informadas.
  - `imgs` de vehículos: 97%.
  - `codigomotor` de vehículos: 79%.
  - `tipocombustible` de vehículos: 69%.
- Los campos ausentes pueden entregarse como cadena vacía (`""`), requiriendo que el parser los trate como `null` / `undefined`.

---

## 6. Paginación y Sincronización Incremental

### 6.1 Paginación por Cursor
1. Petición inicial: `GET /parts?limit=500`
2. Si `meta.next_cursor` no es `null`, la página sucesiva se solicita con `GET /parts?limit=500&cursor=<meta.next_cursor>`.
3. El proceso concluye cuando `meta.next_cursor === null`.

### 6.2 Sincronización Diaria Incremental
El catálogo del proveedor se consolida una vez al día. Para recuperar las alteraciones sin reenviar el catálogo completo:
```http
GET /parts?updated_since=<ISO-8601>&include_deleted=1&limit=500
```
- Las piezas eliminadas o vendidas tienen `deleted_at != null` y deben marcarse como `OUT_OF_STOCK` en la base de datos canónica.

---

## 7. Límites Operativos y Gestión de Errores

### 7.1 Cuotas Declaradas
- **Tasa por minuto:** 120 peticiones / minuto.
- **Tasa diaria:** 50.000 peticiones / día.
- Las cabeceras de respuesta HTTP informan del estado del cupo (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).

### 7.2 Mapeo de Códigos HTTP de Error
| Código | Código de Error | Causa y Acción de Mitigación |
|---|---|---|
| `400` | `invalid_parameter` | Parámetro de búsqueda, límite o fecha mal formado. Cancelar lote y loguear. |
| `401` | `unauthorized` | Token ausente o incorrecto. Alertar al administrador del sistema. |
| `403` | `insufficient_scope` | La clave carece de permisos de lectura para el recurso. |
| `403` | `key_disabled` / `key_expired` | Clave revocada o caducada. Desactivar sincronización de este proveedor. |
| `403` | `ip_not_allowed` | Servidor fuera de la lista blanca de IPs autorizadas. |
| `404` | `not_found` | Recambio o vehículo no encontrado. |
| `426` | `https_required` | Se intentó una conexión no cifrada. |
| `429` | `rate_limited` | Exceso de peticiones. Respetar cabecera `Retry-After` con retroceso exponencial. |
| `500` | `internal_error` | Fallo interno en los servidores de Eurodesguace. Reintentar hasta 3 veces con jitter. |
| `503` | `service_unavailable` | Mantenimiento del catálogo. Pausar sincronización. |
