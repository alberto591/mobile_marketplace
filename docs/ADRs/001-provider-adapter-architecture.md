# ADR 001: Desacoplamiento de APIs de Desguaces mediante Arquitectura de Adaptadores Independientes

- **Estado:** Aceptado (Decisiones operativas dependientes de APIs reales: PENDIENTES)
- **Fecha:** 2026-10-19
- **Decisores:** CTO / Product Lead / Senior Full-Stack Engineer

---

## 1. Contexto y Problema

El marketplace necesita agregar de forma unificada el catalogo de recambios usados procedentes de dos Centros Autorizados de Tratamiento (CAT / desguaces) que ya disponen de APIs de inventario. En fases posteriores, la plataforma debera incorporar desguaces adicionales sin necesidad de redisenar la aplicacion movil ni alterar el modelo de datos canónico.

Los desguaces no emplean un estandar universal de intercambio de datos:
- Cada proveedor estructura su catalogo con formatos, nombres de campos, jerarquias de categorias y codigos de estado dispares.
- Algunos proveedores pueden identificar vehiculos mediante codigos de version locales, mientras que otros utilizan referencias de motor o descripciones en texto libre.
- Las capacidades tecnicas de sus servidores varian sensiblemente (limites de peticiones por minuto, paginacion por cursor vs offset, ausencia o presencia de marcas temporales de modificacion).

Acoplar el modelo de base de datos o los componentes de la aplicacion movil a la estructura de un proveedor particular haria el sistema fragil, costoso de mantener e incompatible con la escalabilidad del negocio.

---

## 2. Opciones Evaluadas

### Opcion A: Ingesta Monolitica Acoplada
Un unico servicio de importacion con logica condicional (`if provider == 'A' ... else if provider == 'B' ...`).
- *Ventajas:* Rapidez inicial aparente para dos fuentes.
- *Desventajas:* Violacion del principio de Abierto/Cerrado (OCP); alto riesgo de regresiones al anadir un tercer desguace; dificultad para aislar fallos especificos de una API.

### Opcion B: Arquitectura Hexagonal con Adaptadores Independientes de Proveedor (Seleccionada)
Definicion de un contrato de interfaz formal (`ScrapYardAdapter`) en la capa de puertos del dominio. Cada desguace cuenta con un modulo adaptador dedicado que implementa dicho contrato, validando las respuestas externas con Zod y transformando la informacion hacia el modelo canonico.
- *Ventajas:* Aislamiento completo de fallos por proveedor; pruebas unitarias rigurosas mediante fixtures estaticas; incorporacion de nuevos desguaces como plugins sin tocar la base existente; proteccion absoluta del cliente movil frente a cambios en esquemas de terceros.
- *Desventajas:* Requiere una inversion inicial en contratos de interfaces, esquemas de normalizacion y diccionarios taxonomicos.

### Opcion C: Plataformas de Integracion Externa (iPaaS / Herramientas No-Code)
Delegar la sincronizacion en herramientas externas tipo Make o Zapier.
- *Ventajas:* Configuracion visual rapida.
- *Desventajas:* Costes de ejecucion prohibitivos para sincronizaciones masivas de miles de piezas; latencia imprevisible; incapacidad de gestionar de forma robusta la idempotencia, deduplicacion avanzada y transaccionalidad de base de datos requeridas.

---

## 3. Decision

Se adopta la **Opcion B: Arquitectura de Adaptadores Independientes**.

1. Se define la interfaz canonica `ScrapYardAdapter` con operaciones basicas requeridas para el ciclo de vida del inventario:
   - `fetchCatalog(options)`: Extraccion paginada de piezas.
   - `fetchPartDetails(externalId)`: Consulta detallada de una pieza concreta.
   - `checkAvailability(externalId)`: Verificacion puntual de stock (si la API lo soporta).
2. Cada desguace contara con su propio adaptador (`ProviderAAdapter`, `ProviderBAdapter`), desacoplado e independiente.
3. El proceso de sincronizacion persistira las piezas en el modelo canonico mediante operaciones idempotentes basadas en la clave compuesta `(vendor_id, external_part_id)`.
4. El cliente movil y los endpoints de consulta de la aplicacion unicamente consumen las tablas y vistas del modelo canonico, permaneciendo completamente ajenos a la existencia de APIs propietarias.

---

## 4. Consecuencias y Mitigaciones

### Positivas
- **Trazabilidad:** Cada pieza ofertada mantiene su origen, fecha de verificacion y estado de sincronizacion.
- **Resiliencia:** Si la API del Desguace A sufre una caida o cambia su formato sin previo aviso, la operacion del Desguace B y del resto de la aplicacion continua sin interrupcion.
- **Capacidad de Prueba:** Permite desarrollar y probar exhaustivamente el buscador y la interfaz movil usando fixtures simuladas que implementan el contrato, antes de recibir las credenciales reales de produccion.

### Compensaciones y Mitigaciones
- **Esfuerzo de Normalizacion:** Se debera mantener un mapa de traduccion de categorias y estados de conservacion por cada proveedor.
- **Riesgo de Inconsistencia de Stock:** Si un desguace no provee notificaciones en tiempo real, se implementara un sistema de degradacion de confianza de stock basado en `last_synced_at`.

---

## 5. Decisiones Operativas Pendientes de Especificaciones Reales

Quedan formalmente marcados como **PENDIENTES** de resolucion tecnica los siguientes puntos, condicionados a la recepcion de la documentacion OpenAPI y credenciales de ambos desguaces:

1. **Estrategia de Paginacion y Cursors:** Definir si la extraccion utiliza paginacion por pagina/tamano (`page`, `pageSize`), desplazamiento numerico (`offset`, `limit`) o identificador de cursor opaco.
2. **Diferencial vs Extraccion Completa:** Determinar si los proveedores soportan filtrado por fecha de actualizacion (`updated_after`) para reducir el ancho de banda y la duracion del lote, o si exigen barrido completo diario.
3. **Comportamiento ante Bajas de Inventario:** Establecer si el proveedor notifica explicitamente las piezas vendidas/dadas de baja o si deben inferirse por omision tras una sincronizacion completa exitosa.
4. **Metodos de Autenticacion y Renovacion:** Implementar la gestion de tokens segun sean API Keys estaticas, tokens Bearer con ciclo de refresco o firmas criptograficas.
