# Documento de Arquitectura de Software

Este documento define la arquitectura tecnica, los limites entre modulos, el flujo de datos y las directrices de integracion para el marketplace de recambios de desguace.

---

## 1. Principios de Diseno

1. **Arquitectura Hexagonal (Puertos y Adaptadores):**
   - El nucleo de dominio (`domain`) es puro: no depende de frameworks de UI (React Native), de clientes HTTP (Fetch/Axios) ni de bases de datos concretas (PostgreSQL/Supabase).
   - Las dependencias apuntan exclusivamente hacia adentro. La logica de negocio y el modelo de datos canonico no se acoplan a la estructura de las APIs de los desguaces.
2. **Inyeccion de Dependencias en la Raiz de Composicion:**
   - La creacion de instancias de clientes externos y adaptadores se realiza en el punto de entrada de la aplicacion o en las funciones servidor, nunca dentro de las entidades de dominio.
3. **Tipado Estricto de Extremo a Extremo:**
   - Todo el codigo se escribe en TypeScript estricto (`noImplicitAny`, `strictNullChecks`).
   - Los datos procedentes de APIs externas se validan en tiempo de ejecucion mediante esquemas de validacion (por ejemplo, Zod) antes de ser admitidos en el dominio.
4. **Idempotencia y Trazabilidad:**
   - Las sincronizaciones de catalogo deben ser repetibles sin provocar duplicados en el inventario ni corrupcion de stock.
   - Cada pieza almacena su identificador unico de origen (`external_part_id`), el identificador del vendedor (`vendor_id`) y la marca de tiempo de la ultima verificacion (`last_synced_at`).
5. **Politica de Honestidad de Datos:**
   - Queda prohibido devolver datos simulados o ficticios para enmascarar caidas de proveedores en entornos de produccion. Si una API falla o un lote se interrumpe, el sistema debe registrar el fallo y reflejar el estado con exactitud.
6. **Seguridad y Doce Factores:**
   - Ningun token, clave privada o credencial de proveedor debe residir en el codigo fuente ni empaquetarse en la aplicacion movil cliente.
   - Configuracion externa validada al arranque del servicio (fail-fast).

---

## 2. Limites entre Modulos del Sistema

```text
+--------------------------------------------------------------------------+
|                            apps/mobile                                   |
|  - Expo Router (Navegacion basada en carpetas)                           |
|  - Componentes de UI (Listados, Buscador, Ficha de Pieza, Filtros)       |
|  - Hooks y Contextos de Estado de Cliente                                |
|  - Supabase Client (Acceso a API pública con RLS)                        |
+--------------------------------------------------------------------------+
                                     |
                                     v (Llamadas API / Queries con RLS)
+--------------------------------------------------------------------------+
|                             supabase/                                    |
|  - PostgreSQL: Tablas canonicas, indices B-Tree, GIN para busqueda FTS  |
|  - Politicas RLS (Row Level Security): Lectura publica / Escritura CAT   |
|  - Edge Functions: Endpoints seguros para ingesta y orquestacion         |
+--------------------------------------------------------------------------+
                                     ^
                                     | (Normalizacion e insercion controlada)
+--------------------------------------------------------------------------+
|                           packages/core                                  |
|  - domain/         -> Entidades (Part, Vendor, Vehicle, Compatibility)   |
|  - ports/          -> Interfaces (ScrapYardAdapter, SyncEnginePort)      |
|  - validation/     -> Esquemas de validacion y parseo (Zod)              |
+--------------------------------------------------------------------------+
                                     ^
                                     | (Implementacion de puertos)
+--------------------------------------------------------------------------+
|                      adapters/ (Infraestructura)                         |
|  - provider-a/     -> ScrapYardAAdapter (Transformador API Desguace 1)   |
|  - provider-b/     -> ScrapYardBAdapter (Transformador API Desguace 2)   |
+--------------------------------------------------------------------------+
                                     ^
                                     | (HTTP autenticado desde servidor)
               [ API Desguace 1 ]         [ API Desguace 2 ]
```

### Detalle de Responsabilidades por Modulo

- **`apps/mobile` (Capa de Presentacion):**
  - Enfocada en la experiencia de usuario: rapidez de busqueda, carga progresiva de fotografias y claridad en el estado y compatibilidad de cada recambio.
  - Interactua con el backend mediante el cliente de Supabase respetando estrictamente las politicas de seguridad RLS.
  - No contiene logica de transformacion de APIs de terceros ni secretos de sincronizacion.

- **`packages/core` (Dominio y Contratos):**
  - Contiene los modelos canónicos del negocio y las definiciones de tipos TypeScript compartidos.
  - Define los contratos de interfaces (puertos) que todo adaptador de desguace debe cumplir.

- **`adapters/` o `supabase/functions/sync-engine` (Infraestructura):**
  - Modulos aislados que traducen los formatos propietarios de cada API al modelo canonico.
  - Gestionan paginacion, control de limites de peticiones (*rate limiting*), reintentos con retardo exponencial y registro estructurado de errores.

- **`supabase/` (Persistencia y Control de Acceso):**
  - Base de datos relacional PostgreSQL con extensiones necesarias (por ejemplo, `pg_trgm` para coincidencias aproximadas y busqueda textual).
  - Control de acceso mediante Row Level Security (RLS) para proteger los datos de contacto y pedidos.

---

## 3. Flujo de Datos del Catalogo

El ciclo de vida del inventario sigue un flujo unidireccional y desacoplado:

1. **Extraccion:**
   - Un proceso programado (o ejecutable por evento) invoca el puerto `ScrapYardAdapter` correspondiente a cada desguace.
   - Las peticiones se autentican desde un entorno seguro de servidor mediante credenciales gestionadas en variables de entorno.
2. **Validacion y Filtrado:**
   - El payload original de la API se valida con el esquema Zod especifico del proveedor.
   - Se comprueba la presencia de campos minimos obligatorios: identificador externo, titulo/nombre de la pieza, precio, estado y al menos una referencia o vehiculo identificable.
3. **Mapeo al Modelo Canonico:**
   - El adaptador traduce los terminos y categorias locales del desguace a la taxonomia comun del marketplace (por ejemplo: "Faros y Pilotos" -> `ILUMINACION_FARO_DELANTERO`).
   - Se normalizan las referencias OEM eliminando espacios, guiones y caracteres no alfanumericos.
4. **Persistencia Idempotente:**
   - Insercion o actualizacion utilizando `UPSERT` sobre el indice unico compuesto `(vendor_id, external_part_id)`.
   - Se actualiza `last_synced_at` y el estado de disponibilidad.
5. **Tratamiento de Bajas y Desapariciones:**
   - Si una sincronizacion completa finaliza satisfactoriamente, las piezas no vistas en el lote (`last_synced_at < batch_start_time`) pasan a estado de disponibilidad `NO_DISPONIBLE` o `RETIRADA`. No se borran fisicamente para preservar historiales de busqueda o solicitudes.
6. **Consulta desde la App:**
   - La app movil ejecuta consultas indexadas directamente contra PostgreSQL filtrando por `availability_status = 'DISPONIBLE'`.

---

## 4. Motor de Busqueda y Reglas de Compatibilidad

La precision en la compatibilidad es el factor mas critico para evitar devoluciones y frustracion del comprador.

### Jerarquia de Senales de Compatibilidad

1. **Nivel 1 (Coincidencia Maxima - Referencia OEM):**
   - Coincidencia exacta de la referencia OEM de la pieza con la referencia buscada por el usuario.
   - Etiqueta UI: `Compatibilidad verificada por referencia OEM`.
2. **Nivel 2 (Coincidencia Media - Vehiculo Donante Completo):**
   - Coincidencia de Marca, Modelo, Generacion, Rango de Anos, Codigo de Motor y Combustible.
   - Etiqueta UI: `Compatible con vehiculo donante; confirma referencia antes de comprar`.
3. **Nivel 3 (Coincidencia Parcial / No Confirmada):**
   - Coincidencia aproximada de modelo o busqueda generica por categoria.
   - Etiqueta UI: `Compatibilidad no confirmada; consulta con el desguace`.
4. **Regla de Prohibicion Estricta:**
   - Queda terminantemente prohibido indicar "100% compatible" basandose unicamente en que dos vehiculos compartan marca o nombre comercial de modelo.

---

## 5. Modelo de Identidad de Producto frente a Pieza Individual (ADR 002)

Para conciliar la facilidad de comparacion entre vendedores con el rigor legal y la naturaleza de recambios usados:

1. **`Part` es la entidad canónica de inventario:** Cada registro representa una unidad física única en un desguace concreto, con su propio precio, fotos reales, estado comprobado, vehículo donante y trazabilidad de origen. Queda prohibido colapsar o fusionar físicamente dos ofertas.
2. **`ProductIdentity` es una proyección agregada de lectura:** Agrupa dinámicamente piezas por referencia OEM normalizada para mostrar al usuario la horquilla de precios (`minPrice`, `maxPrice`) y el número de desguaces disponibles, sin alterar la identidad de las piezas individuales.
3. Más información en [ADR 002: Separación entre Entidad de Inventario (Part) y Proyección Agregada de Catálogo (ProductIdentity)](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/002-product-identity-vs-part-inventory.md).

---

## 6. Limites de Seguridad y Normativa

1. **Aislamiento de Secretos:**
   - Los tokens de API, contraseñas de servicio y claves maestras (`service_role_key`) nunca se exponen al cliente Expo.
2. **Trazabilidad y Verificacion CAT (RD 265/2021):**
   - Solo pueden integrarse entidades registradas como Centro Autorizado de Tratamiento de Vehiculos (CAT). El modelo de datos incluye `cat_authorisation_verified`.
3. **Trazabilidad de Comerciantes (Art. 30 Digital Services Act - DSA):**
   - Registro de datos mercantiles y de contacto de cada desguace para responder a requerimientos legales de trazabilidad en plataformas de intermediacion.
4. **Minimizacion de Datos de Vehiculo:**
   - No se almacenan matriculas ni numeros de bastidor (VIN) completos de usuarios salvo consentimiento expreso y necesidad operativa demostrada.

---

## 7. Decisiones Pendientes (Bloqueadas por Datos de APIs Reales)

Las siguientes decisiones tecnicas se encuentran formalmente en estado **PENDIENTE** hasta obtener la documentacion real de los dos desguaces iniciales:

- **Mecanismo de Sincronizacion:** Determinar si los desguaces ofrecen webhooks en tiempo real, endpoints de cambios diferenciales (`changes_since`), o si es necesario realizar extracciones completas periodicas (*batch polling*).
- **Consulta de Stock en Tiempo Real:** Evaluar si existe un endpoint rapido de verificacion de disponibilidad (`checkAvailability(externalId)`) previo a una intencion de reserva.
- **Capacidad Transaccional:** Confirmar si las APIs permiten crear reservas o pedidos, o si la Fase 1 debe operar exclusivamente con el flujo de solicitud de disponibilidad (leads).
- **Gestion de Imagenes:** Determinar si las URLs de las imagenes son permanentes y permiten hotlinking directo con cache en CDN, o si es necesario descargarlas y servirlas desde Supabase Storage.
- **Motor de Busqueda Especializado:** Determinar si el volumen del catalogo inicial y los tiempos de respuesta justifican introducir un motor dedicado (Typesense o Meilisearch) o si PostgreSQL con indices GIN y trigramas satisface los umbrales de latencia.
