# MVP Product Brief — Marketplace móvil de recambios de desguace

**Versión:** 1.0  
**Fecha de investigación:** 19 de octubre de 2026  
**Mercado inicial propuesto:** España, empezando con los dos desguaces que ya permiten acceso a su inventario mediante API.  
**Estado:** hipótesis de producto; requiere validación con las APIs reales, los vendedores y compradores piloto.

---

## 1. Resumen ejecutivo

La propuesta es crear un marketplace móvil que agregue piezas usadas originales de varios desguaces profesionales y permita a compradores particulares y, potencialmente, talleres localizar la pieza correcta sin tener que visitar las webs o llamar a varios CAT.

La oportunidad no debe definirse como «no existe competencia». Sí existen marketplaces consolidados y apps nativas internacionales. Ovoko/RRR ofrece un gran catálogo europeo, APIs para integrar inventario, logística y un modelo de comisión más tarifa de transacción. Recambio Verde ofrece búsqueda, solicitudes, carrito, pagos y pedidos que se formalizan entre comprador y vendedor. Desguazon agrega stock de desguaces profesionales y ofrece compra online. Car-Part.com tiene app móvil en Norteamérica y destaca búsqueda por múltiples piezas, escaneo de VIN, ordenación por ubicación e imágenes cuando están disponibles. InYards es otra app de marketplace local de piezas usadas, orientada a contacto directo con vendedores.

Por tanto, la oportunidad que hay que validar es más concreta:

> **¿Podemos ofrecer en España una experiencia móvil más cómoda, una búsqueda y compatibilidad más clara, y un inventario actualizado suficiente para generar ventas adicionales a desguaces que ya tienen stock digitalizado?**

### Recomendación principal

Construir un producto mobile-first con una base técnica común para app y web, empezando por integrar los dos catálogos disponibles. La app nativa puede formar parte del producto desde el inicio, pero conviene mantener una web móvil indexable por buscadores: muchos compradores empiezan buscando en Google una pieza concreta y todavía no tienen motivo para instalar una app.

No empezar con logística compleja, cesta multidesguace, matrícula mágica ni recomendaciones de compatibilidad que no puedan verificarse. Primero demostrar que el catálogo se sincroniza de forma fiable, que los compradores encuentran piezas útiles y que los desguaces convierten las solicitudes en ventas.

---

## 2. Investigación competitiva

### 2.1 Competidores y referentes

| Plataforma | Tipo | Qué aporta como referencia | Diferencia/oportunidad a investigar |
|---|---|---|---|
| **Ovoko / RRR** | Marketplace europeo B2C de piezas usadas | Catálogo grande, vendedores profesionales, API de inventario, logística, atención posventa y comisiones por venta/transacción | Es un competidor fuerte; no asumir que basta con publicar una app. Se debe diferenciar por experiencia, inventario, confianza, especialización o canal local. |
| **Recambio Verde** | Marketplace español que conecta con CAT | Buscador, solicitudes/ofertas, ficha, carrito, pago y seguimiento. Las condiciones consultadas dicen que la venta se celebra entre comprador y establecimiento; SIDEO interviene en el cobro. | Investigar si la experiencia móvil, la búsqueda, el tiempo de respuesta y la cobertura son puntos de dolor reales. |
| **Desguazon** | Marketplace/tienda online agregadora de piezas reutilizadas | Buscador libre, búsqueda por referencia OEM, compra online, categorías amplias, información sobre compatibilidad, envíos, garantía y devoluciones. | Comparar catálogo, claridad de compatibilidad, stock en tiempo real y experiencia de compra. No clasificarlo como una simple web de anuncios. |
| **B-Parts** | Comercio online de recambios usados originales | Catálogo, compra online, flujo de devoluciones y atención posventa estructurados. | Referente de confianza y posventa, aunque su modelo no sea idéntico al de un marketplace abierto. |
| **Car-Part.com** | Marketplace de desguaces de EE. UU./Canadá | App nativa, búsqueda de varias piezas, escaneo de VIN, resultados ordenados por distancia e imágenes cuando el proveedor las tiene. | Referente útil para funcionalidades; el mercado y el ecosistema de recicladores son diferentes a España. |
| **InYards** | Marketplace local de piezas usadas y vehículos en despiece | App, fotos reales, chat y acuerdos de recogida/envío entre comprador y vendedor. | Referente de experiencia móvil/local; no es equivalente a una gran red profesional española. |
| **Milanuncios y eBay** | Marketplaces generalistas | Tráfico y demanda de piezas de segunda mano | Pueden competir por búsquedas puntuales, pero no resuelven necesariamente catálogo profesional normalizado, compatibilidad y stock multi-desguace de forma especializada. |

### 2.2 Conclusión competitiva

No está demostrado que el mercado español carezca de apps nativas de compra; lo que no se ha confirmado en esta investigación es una app española nativa, ampliamente implantada y centrada en agregar el inventario de desguaces profesionales con un viaje de compra comparable al de una tienda móvil moderna.

Eso debe validarse directamente en App Store, Google Play y entrevistas. La ausencia en una búsqueda no es prueba de ausencia en el mercado.

### 2.3 Lo que podemos aprender de los competidores

**De Ovoko:** el vendedor necesita carga/sincronización de inventario, codificación de piezas, fotos, ubicación en almacén, pedidos, logística, soporte y devoluciones. Su documentación pública confirma comisión y tarifa de transacción, sin cuota de publicación o suscripción en el modelo anunciado. También expone una API con mapeos obligatorios para categorías y características de vehículo/pieza.

**De Recambio Verde:** el marketplace debe mostrar fotos, descripción, envío, devolución, precio y vendedor; permite solicitar información, enviar una compra y seguir el pedido. Sus condiciones hacen explícito que los productos pertenecen a los establecimientos afiliados.

**De Desguazon:** no se debe sugerir que una pieza vale para un coche solo porque coincide marca/modelo. Año, generación, motor, versión, caja de cambios, equipamiento y referencia OEM pueden cambiar la compatibilidad.

**De Car-Part.com:** buscar por VIN y por varias piezas de un mismo vehículo puede reducir esfuerzo. La app publica imágenes de piezas cuando el inventario las incluye.

Fuentes consultadas al final del documento.

---

## 3. Problema del usuario y propuesta de valor

### Problema para el comprador

- No sabe qué desguace tiene la pieza.
- Tiene que repetir la misma consulta en varios sitios o llamar a varios centros.
- No siempre distingue entre piezas parecidas, equivalentes o verdaderamente compatibles.
- En una pieza usada, la foto y el estado real importan tanto como la descripción.
- No conoce con claridad disponibilidad, coste final de envío, garantía y devolución antes de comprar.
- Puede descubrir tarde que el anuncio está desactualizado o que la pieza ya se vendió.

### Problema para el desguace

- Quiere más ventas de inventario ya catalogado.
- No quiere que otro canal le obligue a mantener el stock por duplicado.
- Necesita que cada anuncio tenga precio, fotos y disponibilidad correctos.
- Necesita un proceso sencillo para confirmar pedidos, preparar el paquete y gestionar incidencias.
- Una venta fallida por stock incorrecto o compatibilidad errónea consume tiempo y daña su reputación.

### Propuesta de valor

**Para compradores:** «Encuentra una pieza usada original entre varios desguaces, comprueba qué información respalda la compatibilidad y compra o consulta disponibilidad desde el móvil».

**Para desguaces:** «Consigue pedidos adicionales desde un canal nuevo reutilizando el inventario que ya tienes en tu sistema, sin volver a cargar manualmente cada pieza».

### Diferenciación que merece prueba

1. Experiencia mobile-first y búsqueda rápida.
2. Fotos reales y campos transparentes del estado de la pieza.
3. Compatibilidad explicada con distintos grados de confianza, sin prometer lo que los datos no prueban.
4. Stock reciente y aviso honesto de cuándo se sincronizó por última vez.
5. Solicitud asistida cuando no aparece la pieza exacta.
6. Integración sencilla con el sistema de inventario del desguace.

---

## 4. Usuarios iniciales

### Persona A — Particular que repara su coche

Quiere ahorrar frente a una pieza nueva. No siempre conoce la referencia OEM; necesita ayuda para especificar marca, modelo, año, motor y versión. Valora fotos reales, precio final, garantía y devolución.

### Persona B — Taller independiente

Busca recambios con más frecuencia y suele tener matrícula/VIN, referencia OEM o especificaciones exactas. Valora rapidez, stock fiable, factura, condiciones de devolución y soporte. Puede generar más recurrencia que un comprador particular, pero requiere hablar con talleres para confirmar cómo compran hoy.

### Enfoque recomendado

Lanzar el catálogo abierto a particulares, pero probar captación y recurrencia con unos pocos talleres de la zona de los desguaces piloto. La prioridad no debe ser atender todos los tipos de comprador con funciones diferentes desde el primer día.

---

## 5. Alcance del MVP

### 5.1 Incluido en la primera versión

**Catálogo**
- Integrar datos de los dos desguaces mediante conectores independientes.
- Importar identificador externo, nombre/descripción, categoría, precio, fotos, disponibilidad, vehículo de origen, referencias OEM y campos realmente disponibles.
- Conservar el identificador y la fuente de cada pieza.
- Sincronizar alta, cambios, precio, stock y retirada/baja.
- Marcar registros como desactualizados si la sincronización falla; no mostrar como disponible inventario que no puede verificarse.

**Búsqueda y navegación**
- Buscar por palabras: «retrovisor izquierdo», «alternador», «faro», etc.
- Buscar por referencia OEM o código de pieza.
- Filtros por categoría, marca, modelo, año, precio, ubicación del desguace y disponibilidad cuando haya datos fiables.
- Resultados ordenados por relevancia; no por comisión cobrada al marketplace.
- Página de resultados rápida y usable con una mano.

**Ficha de pieza**
- Nombre normalizado y categoría.
- Fotos reales.
- Precio y tratamiento del IVA claramente presentado.
- Descripción, condición/estado y prueba funcional si se facilitan.
- Referencia OEM y datos del vehículo donante disponibles.
- Desguace vendedor y ubicación aproximada.
- Disponibilidad y última sincronización.
- Coste/plazo estimado de envío y condiciones de garantía/devolución cuando estén confirmadas.
- CTA visible: «Comprobar compatibilidad» y «Consultar disponibilidad» o «Comprar», según capacidades reales de la API.

**Cuenta**
- Navegar y buscar sin obligar a crear cuenta.
- Cuenta para guardar favoritos, vehículo y solicitudes si el usuario desea hacerlo.
- Historial de solicitudes/pedidos cuando el flujo transaccional esté activado.

**Administración**
- Estado de cada integración, última sincronización, número de piezas insertadas/actualizadas/desactivadas y errores.
- Búsqueda de una pieza por ID externo.
- Gestión de vendedores, categorías normalizadas y avisos/incidencias.
- Registro de acciones y cambios relevantes.

**Medición**
- Consultas realizadas, cero-resultados, clics en productos, consultas de disponibilidad, inicios de compra, pedidos completados y devoluciones/incidencias.

### 5.2 No incluido al principio

- Marketplace de varios países o múltiples monedas.
- Aplicación para que cualquier usuario particular venda piezas sin ser un CAT verificado.
- Carrito que combine piezas de varios vendedores en un solo pedido.
- Automatización compleja de rutas, almacén o expedición.
- Predicción de compatibilidad por IA sin datos suficientes.
- Búsqueda por matrícula con garantía de compatibilidad sin proveedor de datos/licencia y validación legal.
- Subastas, pujas, financiación, seguros o programa de fidelidad.
- Panel profesional completo de gestión de almacén: el MVP consume el inventario que ya existe en las APIs.

---

## 6. Requisito central: integración con las APIs de los dos desguaces

No conocemos todavía los endpoints ni los campos de tus dos APIs. Por tanto, **no debemos suponer que permiten reservar stock, crear pedidos o sincronizar cambios en tiempo real**. Primero hay que revisar las especificaciones y probar llamadas reales.

### 6.1 Checklist para cada API

1. ¿Existe documentación OpenAPI/Swagger o un ejemplo de petición y respuesta?
2. ¿Cómo autentica: API key, OAuth, token, usuario/contraseña, allowlist de IP?
3. ¿Permite descargar todo el catálogo o paginar resultados?
4. ¿Permite consultar cambios desde una fecha o tiene webhooks?
5. ¿Qué representa una pieza y cuál es su ID único y estable?
6. ¿Qué campos tiene: categoría, marca/modelo, año, motor, OEM, estado, fotos, precio, IVA, stock, localización, envío, garantía?
7. ¿Cómo comunica una baja, venta, reserva o stock agotado?
8. ¿Permite reservar una pieza para evitar vender una unidad única dos veces?
9. ¿Permite crear/actualizar pedido o solo leer catálogo?
10. ¿Qué límites de peticiones aplica, y qué errores/reintentos recomienda?
11. ¿Las fotos pueden mostrarse en otro marketplace? ¿Hay límites de uso de los datos?
12. ¿Qué pasa si una petición devuelve error o el catálogo queda incompleto?

### 6.2 Arquitectura recomendada de sincronización

Crear un **adaptador por desguace** que traduzca su formato al modelo común del marketplace. No mezclar la lógica específica de un proveedor en los componentes de la app.

Flujo recomendado:

`API del desguace → adaptador → validación/normalización → base de datos canónica → índice de búsqueda → app/web`

- Guardar el ID original y el ID interno.
- Guardar opcionalmente el payload original permitido para depuración/auditoría, sin exponerlo al cliente.
- Hacer sincronización idempotente: repetir una importación no debe duplicar piezas.
- Implementar paginación, reintentos con backoff, límites de tasa y logs por lote.
- Solo retirar anuncios que falten si la sincronización completa terminó correctamente; una API caída no debe vaciar el catálogo por error.
- Registrar `source_updated_at`, `last_seen_at` y `last_synced_at`.
- Gestionar el inventario de cada pieza como unidad única, no solo como producto genérico. Dos faros parecidos de dos vehículos donantes son dos unidades diferentes.
- Actualizar stock/precio con frecuencia determinada por las capacidades y límites de cada API.
- Al fallar la sincronización, degradar la confianza de disponibilidad o pausar el anuncio según el tiempo transcurrido.
- Respetar credenciales y términos de uso; los secretos solo se guardan en servidor/entorno seguro, nunca en el cliente móvil.

### 6.3 Modelo de datos canónico mínimo

**vendors**
- `id`, `name`, `legal_name`, `tax_id` (privado), `contact`, `address`, `cat_authorisation_verified`, `shipping_policy`, `returns_policy`, `warranty_policy`, `status`, timestamps.

**source_integrations**
- `id`, `vendor_id`, `provider_type`, `last_success_at`, `last_attempt_at`, `sync_status`, `sync_cursor`, `error_summary`, `rate_limit_config`.

**parts**
- `id`, `vendor_id`, `source_integration_id`, `external_part_id`, `sku`, `title`, `description`, `normalized_category_id`, `price`, `currency`, `vat_mode`, `condition`, `tested_status`, `availability_status`, `stock_quantity` si es aplicable, `oem_reference`, `source_updated_at`, `last_synced_at`, `last_seen_at`, `shipping_profile_id`, timestamps.

**part_vehicle**
- `part_id`, `make`, `model`, `generation`, `year_from`, `year_to`, `engine_code`, `fuel`, `displacement`, `power`, `transmission`, `body_type`, `donor_vehicle_id` (solo si está autorizado y es necesario).

**part_images**
- `id`, `part_id`, `source_image_url`, `display_url`, `sort_order`, `is_primary`, `rights_confirmed`, `last_checked_at`.

**part_oem_references**
- `part_id`, `oem_reference`, `normalized_reference`, `reference_type`.

**search_events / product_events**
- query, filters, result count, clicked part, timestamp, anonymous/session ID minimizado, consent/configuración aplicable.

**availability_requests**
- `id`, `buyer_id` o identificador de sesión, `part_id`, mensaje, estado, seller response, timestamps.

**orders / order_items / payments / shipments / returns**
- Solo activar el conjunto transaccional completo si se decide vender y cobrar dentro de la plataforma.

**saved_vehicles / favorites / saved_searches**
- Conveniente después de validar que hay usuarios recurrentes.

### 6.4 Normalización de piezas

Cada API puede utilizar categorías, nombres y valores distintos. Crear un diccionario de categorías común (motor, caja de cambios, carrocería, iluminación, electricidad/electrónica, interior, suspensión/dirección, climatización, ruedas/neumáticos, etc.) y un mapeo del valor original al normalizado.

Conservar siempre el dato original para no perder información. Las referencias OEM requieren limpieza básica (espacios, guiones, mayúsculas) sin destruir variantes significativas. No se debe tratar como idénticas dos piezas solo por compartir un nombre.

---

## 7. Búsqueda y compatibilidad: el problema técnico más importante

Una búsqueda que devuelve muchas piezas incorrectas es peor que una búsqueda que devuelve menos resultados, pero fiables.

### Orden recomendado de señales

1. **Referencia OEM exacta**: coincidencia fuerte si la referencia está validada y aplica a la pieza.
2. **Referencia cruzada/equivalente**: solo si existe fuente fiable y licencia para utilizarla.
3. **Vehículo completo**: marca, modelo, generación, año, motor, potencia, combustible, caja y variante, siempre según datos disponibles.
4. **Categoría/nombre/descripción**: útil para recuperar resultados, pero no prueba compatibilidad.
5. **Fotos/atributos físicos**: lado izquierdo/derecho, color, número de conectores, forma, etc., si esos datos están disponibles.

### Mensajes de confianza propuestos

- «Coincide la referencia OEM»
- «Coinciden los datos de vehículo disponibles; confirma la referencia antes de comprar»
- «Compatibilidad no confirmada: consulta al desguace»

Evitar el mensaje universal «100 % compatible» salvo que se disponga de una fuente verificable con cobertura apropiada y un contrato/garantía que lo respalde.

### Matrícula y VIN

Son funciones atractivas, pero no deben ser requisito del MVP. Hay que identificar una fuente de datos del vehículo con licencia, comprobar cobertura para España y determinar qué datos deben almacenarse. La matrícula puede estar vinculada a una persona cuando se combina con otros datos. Minimizar la conservación y evitar almacenar el VIN completo si no es necesario.

### Búsqueda técnica

Para el piloto puede bastar PostgreSQL/Supabase con índices B-tree para identificadores y referencias, búsqueda de texto completo, normalización y trigramas para errores tipográficos. Si el catálogo o la calidad de relevancia lo requiere, evaluar un buscador dedicado (por ejemplo, Typesense o Meilisearch) después de medir rendimiento y resultados sin coincidencia.

---

## 8. Flujos de usuario

### Flujo A — Particular busca una pieza

1. Abre la app y puede buscar sin registrarse.
2. Escribe la pieza o referencia OEM y opcionalmente selecciona vehículo.
3. Ve resultados con foto, precio, vendedor, estado, compatibilidad disponible y frescura del stock.
4. Abre una ficha y comprueba la información.
5. Selecciona «Consultar disponibilidad» si el stock no está confirmado o «Comprar» si el flujo de compra está integrado.
6. Recibe confirmación y actualizaciones.

### Flujo B — Taller encuentra recambio

1. Busca por referencia OEM o especificaciones del vehículo.
2. Filtra por precio, disponibilidad y envío.
3. Confirma compatibilidad o solicita comprobación.
4. Hace pedido y recibe factura, seguimiento y canal de incidencia.

### Flujo C — Desguace recibe demanda

1. El catálogo se sincroniza desde su API.
2. El desguace recibe una solicitud o pedido con ID de la pieza y todos los datos necesarios.
3. Confirma disponibilidad, prepara/embala y expide según su proceso.
4. La plataforma actualiza estado y registra incidencias.

### Decisión de MVP: consulta vs checkout

- **Si las APIs solo permiten leer stock:** empezar con búsqueda + solicitud de disponibilidad/lead, seguimiento manual del proceso y medición de conversiones. No presentar como compra confirmada una pieza que no se puede reservar.
- **Si las APIs permiten confirmar/reservar stock y gestionar pedidos:** habilitar checkout con un único vendedor por pedido, pasarela de pago y sincronización de estado.
- **Si los vendedores no tienen API de pedidos pero aceptan operar desde un panel:** se puede crear un pequeño panel de pedidos, con confirmación manual y términos claros, antes de automatizar totalmente.

No añadir cesta multidesguace hasta que se dominen stock, expedición, facturación, reembolsos y responsabilidad por pedido.

---

## 9. Checkout, pagos y logística

### Opciones de monetización operativa

**Opción 1 — Lead/solicitud:** el comprador pide disponibilidad y el desguace responde. Fácil de probar y permite verificar demanda; aún no demuestra el rendimiento de una comisión sobre ventas.

**Opción 2 — Checkout de un solo vendedor:** la app cobra por el artículo y envío, crea el pedido, confirma disponibilidad y transfiere al vendedor su parte, descontando la comisión. Más capacidad de monetización, pero requiere pagos, reembolsos, conciliación, facturación y operaciones.

**Opción 3 — Pedido confirmado fuera de la app:** puede simplificar el primer piloto, pero dificulta atribuir ventas y cobrar una comisión; no debe convertirse en una solución permanente sin control del proceso.

### Recomendación

Usar solicitudes para validar catálogo si aún faltan funciones de reserva/venta en las APIs. Pasar a checkout tan pronto exista un flujo fiable de reserva, venta, envío y devolución. Diseñar desde el principio los IDs de pedido y el tracking para que la migración sea viable.

Para pagos de marketplace, estudiar un proveedor con onboarding/KYC de vendedores, cargos de plataforma, transferencias, reembolsos y conciliación (por ejemplo Stripe Connect). Apple permite usar métodos de pago externos para bienes físicos que se consumen fuera de la app; Google Play Billing tampoco es para comprar bienes físicos. Confirmar las condiciones actuales de proveedores y tiendas antes de implementar.

### Logística

No asumir un plazo universal. El coste/plazo depende de tamaño, peso, destino, manipulación y proveedor. Los motores y cajas de cambio pueden necesitar transporte especial. En el MVP registrar como mínimo:
- quién organiza el envío;
- quién paga el envío de ida y la devolución;
- plazo estimado y condiciones;
- cómo se informa el tracking;
- procedimiento cuando la pieza llega dañada, incorrecta o no es compatible.

---

## 10. Modelo de negocio y economía unitaria

### Modelo inicial sugerido

- Alta y publicación gratuitas para facilitar la incorporación de los primeros desguaces.
- Comisión solo por venta completada, cuando el pedido se pueda rastrear de extremo a extremo.
- No cobrar suscripción en el primer piloto salvo que haya valor probado para el vendedor.
- Más adelante: herramientas premium de catálogo, analítica, sincronización adicional o promociones claramente etiquetadas.

Ovoko anuncia públicamente un modelo de comisión más tarifa de transacción y sin cuota de listado/suscripción. No publica en la página consultada un porcentaje universal. No atribuir ese porcentaje a Ovoko ni copiarlo sin un acuerdo comercial real.

### Fórmulas

- **GMV mensual** = pedidos completados × valor medio de pedido.
- **Ingresos brutos por comisión** = GMV × tasa de comisión.
- **Margen de contribución por pedido** = comisión + ingresos adicionales − coste de pago − coste subvencionado de envío − coste esperado de devoluciones/incidencias − soporte variable − adquisición atribuible al pedido.
- **Pedidos para cubrir costes fijos** = costes fijos mensuales / margen de contribución medio por pedido.

### Escenarios puramente ilustrativos

| Pedidos completados/mes | Ticket medio supuesto | GMV | Comisión supuesta del 10 % | Antes de costes |
|---:|---:|---:|---:|---|
| 100 | 80 € | 8.000 € | 800 € | No descuenta pagos, soporte, devoluciones, marketing ni estructura |
| 500 | 80 € | 40.000 € | 4.000 € | No descuenta pagos, soporte, devoluciones, marketing ni estructura |
| 1.000 | 80 € | 80.000 € | 8.000 € | No descuenta pagos, soporte, devoluciones, marketing ni estructura |

Estos valores son solo una calculadora de escenarios, no un pronóstico de demanda, ticket medio ni tasa de comisión de mercado. Deben reemplazarse por precios y conversiones reales del piloto.

### Lo que preguntar a los desguaces

- ¿Aceptarían una comisión por ventas incrementales atribuidas a la plataforma?
- ¿Cuál es la comisión máxima que consideran sostenible?
- ¿Cuál es el valor medio de venta por categoría?
- ¿Quién asume preparación, envío, devolución y coste de una pieza incorrecta?
- ¿Pueden confirmar stock/reserva por API?
- ¿Qué nivel de ventas mensuales adicionales justificaría mantener la integración?

---

## 11. Arquitectura técnica recomendada

### Principios

- API-first y fuente de verdad del stock claramente definida.
- Frontend móvil desacoplado de las APIs específicas de los desguaces.
- Una capa de catálogo canónico para normalizar proveedores.
- Búsqueda y catálogo disponibles aunque un conector falle, pero sin fingir disponibilidad verificada.
- Trazabilidad de cada dato hasta el vendedor y el registro de origen.
- Coste operativo bajo hasta validar la demanda.

### Propuesta de alto nivel

- **App móvil:** React Native con Expo y TypeScript si se decide publicar app iOS/Android.
- **Web de adquisición/SEO:** storefront responsivo y renderizado en servidor para páginas indexables de categoría, piezas y referencias; no depender solo de un SPA no indexable.
- **Backend/datos:** PostgreSQL/Supabase puede servir al piloto, con funciones servidor/Edge Functions o backend Node/TypeScript para conectores y operaciones sensibles.
- **Hosting:** Vercel para web/backend compatible; Supabase para Postgres/Auth/Storage según los requisitos reales del proyecto.
- **Búsqueda:** empezar con Postgres indexado; añadir motor especializado solo cuando las métricas lo justifiquen.
- **Pagos:** activar un proveedor de marketplace cuando estén definidos los contratos comerciales, los flujos de pedido, reembolso y verificación de vendedores.
- **Observabilidad:** logs de integración, alertas de sincronización, errores de checkout y métricas de búsqueda.

El usuario final nunca debe llamar directamente a las APIs privadas de los desguaces. Las credenciales y transformaciones quedan en el servidor.

### Indexación orgánica

La app nativa no sustituye una web indexable. Crear páginas de piezas/categorías con contenido útil y datos estructurados de producto cuando los datos sean exactos. Google documenta que la información estructurada puede comunicar precio, disponibilidad, envío y política de devoluciones. No generar millones de páginas casi vacías o indexar productos sin stock.

---

## 12. Seguridad, privacidad y legalidad

Este bloque es una lista de temas para asesoramiento profesional antes de vender; no es un dictamen jurídico.

1. **Modelo de vendedor:** decidir si la plataforma es intermediaria tecnológica, agente de cobro o vendedor contractual. Los términos deben describir quién vende, quién factura y quién gestiona garantías/devoluciones.
2. **Vendedores profesionales:** verificar identidad empresarial, datos de contacto y, cuando aplique, registro mercantil y datos de pago. El artículo 30 del Reglamento de Servicios Digitales establece obligaciones de trazabilidad de comerciantes para marketplaces que permiten contratar a distancia con comerciantes, con requisitos y excepciones según el caso.
3. **CAT y piezas reutilizadas:** el Real Decreto 265/2021 regula la gestión de vehículos al final de su vida útil y dispone que solo los CAT autorizados pueden realizar la preparación para la reutilización de estas piezas dentro del marco descrito; también contempla certificado de las piezas preparadas para reutilización y requisitos de traslado. Confirmar la documentación que debe acompañar cada categoría/operación.
4. **Garantía de bienes usados:** el texto consolidado de la Ley General para la Defensa de los Consumidores y Usuarios establece responsabilidad por falta de conformidad durante tres años para bienes, y permite pactar un plazo menor en bienes de segunda mano que no sea inferior a un año. El contrato concreto y el rol de cada parte deben revisarse legalmente.
5. **Desistimiento online:** las ventas a consumidores a distancia generalmente están sujetas al derecho de desistimiento de 14 días, con excepciones reguladas. Debe quedar claro quién recibe la solicitud y quién paga cada coste en cada supuesto.
6. **Precio:** mostrar precio final, IVA aplicable, envío, plazos, vendedor contractual y condiciones antes de cerrar el pedido.
7. **Protección de datos:** privacidad, base jurídica, minimización, retención, consentimientos cuando proceda, ejercicio de derechos, encargados, seguridad y gestión de brechas. No guardar matrícula/VIN o datos del vehículo más tiempo del necesario.
8. **Fotografías y datos de origen:** incluir en el acuerdo con cada desguace el derecho a reutilizar fotos, descripciones y datos de inventario dentro del marketplace.
9. **Pagos y fiscalidad:** definir facturación de la pieza, comisión, impuestos, conciliación, reembolsos, fraude, disputas y potenciales obligaciones de información fiscal de plataformas con asesoría especializada.
10. **Políticas de tienda:** la venta de bienes físicos debe utilizar un método de pago apropiado para bienes físicos, no las compras in-app destinadas al contenido/funcionalidades digitales; verificar las políticas de Apple y Google al presentar las apps.

No copiar automáticamente las condiciones legales de un competidor: validar los términos propios con abogado/gestor, en particular porque un marketplace y el propio desguace pueden tener obligaciones diferentes.

---

## 13. Métricas y experimento piloto

### Métrica principal

**Pedidos entregados sin incidencia atribuible a stock o compatibilidad**, no descargas de la app.

### Métricas de oferta/catalogación

- Número de piezas activas importadas por desguace y categoría.
- % de piezas con foto, precio, OEM, datos del vehículo y disponibilidad.
- Antigüedad de la última sincronización.
- Tasa de errores de importación y tiempo de recuperación.
- Número de resultados que se desactivan por stock no confirmado.

### Métricas de búsqueda/conversión

- Consultas con resultados frente a cero resultados.
- Tasa de clic en resultado.
- Ficha de pieza → comprobar compatibilidad.
- Ficha → solicitud/reserva/checkout.
- Solicitud → respuesta de vendedor.
- Respuesta → venta.
- Venta → entrega.
- Devoluciones e incidencias por 100 pedidos, separadas por motivo.

### Métricas de negocio

- GMV, comisión efectiva, valor medio de pedido y margen de contribución.
- Coste de adquirir un comprador que completa una compra.
- Tiempo y coste de soporte por pedido.
- Repetición de compra a 30/60/90 días.
- Venta incremental declarada/medida para cada desguace.

### Experimento sugerido

1. Importar catálogo de los dos desguaces.
2. Elegir 3–5 categorías según volumen y calidad real del feed, en lugar de escoger categorías solo por intuición.
3. Reunir 50–100 búsquedas reales de compradores/talleres (pieza, vehículo, referencia OEM cuando la tengan).
4. Medir si hay resultados útiles, si el stock sigue disponible y si el usuario contacta/compra.
5. Operar manualmente las primeras solicitudes cuando sea necesario y registrar cada paso.
6. Confirmar con los vendedores el resultado final para medir la conversión real.
7. Entrevistar a quienes no encontraron pieza o abandonaron antes de comprar.

La muestra indicada es un experimento inicial propuesto, no un benchmark del sector. La decisión de invertir más debe basarse en cobertura de catálogo, ventas reales, margen y disposición de los vendedores a seguir integrados.

---

## 14. Roadmap por fases

### Fase 0 — Auditoría de datos e integración

- Obtener documentación y credenciales de las dos APIs.
- Descargar muestras del catálogo y analizar campos, fotos, IDs, OEM, precio, stock y calidad.
- Confirmar derechos de uso y frecuencia de actualización permitida.
- Construir mapa de campos y lista de huecos de datos.
- Decidir si la API permite solo lectura o también reserva/pedido.

**Salida:** matriz de capacidades API, modelo canónico y muestra de catálogo normalizado.

### Fase 1 — Catálogo funcional

- Adaptadores de ambos desguaces.
- Base de datos e importador idempotente.
- Búsqueda, categorías, filtros y ficha de pieza.
- Panel de salud de sincronización.
- Analítica de consultas y cero resultados.

**Salida:** compradores piloto pueden localizar piezas de inventario real.

### Fase 2 — Validación comercial

- Solicitud de disponibilidad y contacto estructurado.
- Panel o notificación para los desguaces.
- Confirmación manual de disponibilidad y venta.
- Captación con talleres y compradores locales.
- Medición de conversión y ventas incrementales.

**Salida:** evidencia de demanda y aprendizaje de objeciones/operaciones.

### Fase 3 — Compra y comisión

- Reservar stock.
- Checkout de vendedor único.
- Pago, comisión, payout/conciliación, factura y estados del pedido.
- Envío, seguimiento, cancelaciones, devoluciones, reembolsos y soporte.
- Términos legales finales.

**Salida:** transacción monetizable de extremo a extremo.

### Fase 4 — Escala

- Añadir más desguaces y adaptadores.
- Guardar vehículos, favoritos y alertas de piezas.
- Mejorar referencias equivalentes/compatibilidad con fuente licenciada.
- Apps nativas iOS/Android si el piloto muestra retención suficiente; SEO/web se mantiene como canal de captación.
- Herramientas de analítica o promoción para vendedores solo si aportan valor demostrado.

---

## 15. Riesgos y mitigaciones

| Riesgo | Por qué importa | Mitigación inicial |
|---|---|---|
| Catálogo pequeño o poco variado | La búsqueda puede no devolver la pieza que la gente necesita | Medir cobertura de consultas reales y elegir categorías con profundidad; incorporar más oferta si hace falta. |
| Stock desactualizado | Una venta fallida perjudica confianza y costes | Sincronización idempotente, `last_synced_at`, reservas cuando existan y pausa automática prudente. |
| Compatibilidad equivocada | Devoluciones, pérdida de confianza y costes de envío | OEM y atributos del vehículo, niveles explícitos de confianza y confirmación cuando falten datos. |
| API solo lectura | No se puede confirmar reserva/pedido automáticamente | Empezar por leads, confirmar manualmente y evitar checkout prematuro. |
| Fotos sin permiso o de baja calidad | Riesgo legal y baja conversión | Acordar licencia de uso y medir cobertura/calidad de imagen. |
| Demasiadas categorías desde el inicio | La normalización y relevancia se complican | Elegir 3–5 categorías basadas en la calidad del feed y demanda del piloto. |
| Coste de adquisición elevado | Las piezas pueden ser compra esporádica | Web indexable y SEO, talleres como canal recurrente, alertas/favoritos más adelante. |
| Devoluciones y logística complejas | Puede eliminar la comisión | Política clara por vendedor, costes definidos, flujo de incidencias y margen por categoría. |
| Competidores establecidos | Inventario y tráfico ya agregados | No competir solo por tamaño; elegir un segmento/experiencia en que se pueda demostrar ventaja. |
| Falta de confianza | El cliente teme comprar una pieza incorrecta/usada | Verificación del vendedor, fotos reales, precio/envío claros, reseñas, garantía y soporte. |

---

## 16. Preguntas de producto que deben resolverse antes de programar checkout

1. ¿Los dos desguaces autorizan por contrato que su inventario y fotos aparezcan en un marketplace nuevo?
2. ¿Cuál de las APIs permite conocer y cambiar disponibilidad en tiempo casi real?
3. ¿Se puede reservar una pieza, crear pedido y anularlo por API?
4. ¿Quién factura al cliente y quién responde ante el consumidor?
5. ¿El vendedor envía a toda España o solo a su región?
6. ¿Quién calcula y cobra el envío por categoría/tamaño?
7. ¿Qué categorías tienen datos más completos y volumen suficiente?
8. ¿Las piezas están identificadas con OEM, datos del vehículo donante y fotos reales?
9. ¿Qué comisión aceptarían los dos desguaces por una venta incremental?
10. ¿Qué debe ocurrir cuando el stock ya no existe o la compatibilidad es dudosa?
11. ¿Hay proveedor licenciado para matrícula/VIN o referencias cruzadas si se quiere esta función?
12. ¿Qué evidencia de demanda ya existe: pedidos por teléfono, búsquedas, preguntas frecuentes, consultas no resueltas?

---

## 17. Próximo entregable técnico

Para convertir este brief en un backlog implementable, revisar para **cada uno de los dos desguaces**:

- documentación Swagger/OpenAPI o manual de integración;
- credenciales de prueba y límites de uso (no incluir secretos en un documento compartido);
- 5–20 ejemplos reales de registros, con datos personales eliminados;
- imágenes o estructura de URLs de fotos;
- mecanismo de paginación y sincronización incremental;
- cómo indican ventas, bajas y disponibilidad;
- si pueden confirmar/reservar pedidos o solo exponer catálogo.

Con eso se puede producir la siguiente versión: especificación exacta de mapeo de campos por API, esquema SQL, diseño de endpoints del backend, historias de usuario, criterios de aceptación y tickets de implementación.

---

## 18. Fuentes consultadas

1. Recambio Verde, **Condiciones de compra**: https://www.recambioverde.es/condiciones_compra
2. Desguazon, **Qué es y cómo funciona**: https://www.desguazon.es/es/s/que-hacemos-en-desguazon/
3. Ovoko, **Incorporación de desguaces, comisiones y logística**: https://join.ovoko.com/es/
4. Ovoko/RRR, **Documentación pública de API**: https://api.rrr.lt/docs/
5. Ovoko España, catálogo y vendedores: https://ovoko.es/vendedor
6. B-Parts, **Devoluciones y reembolsos**: https://www.b-parts.com/es/faqs/devoluciones-y-reembolsos
7. Car-Part.com, **App móvil y funciones para recicladores**: https://www.products.car-part.com/mobile/index.html
8. InYards, **Marketplace de piezas usadas**: https://inyards.com/about
9. App Store España, InYards: https://apps.apple.com/es/app/inyards-auto-parts-marketplace/id6743032170
10. BOE, **Real Decreto 265/2021 sobre vehículos al final de su vida útil**: https://www.boe.es/eli/es/rd/2021/04/13/265
11. BOE, **Ley General para la Defensa de los Consumidores y Usuarios, texto consolidado**: https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555&p=20250103&tn=0
12. Your Europe, **Devoluciones y derecho de desistimiento**: https://europa.eu/youreurope/citizens/consumers/shopping/returns/index_es.htm
13. EUR-Lex, **Reglamento de Servicios Digitales, artículo 30**: https://eur-lex.europa.eu/legal-content/ES/ALL/?uri=CELEX:32022R2065
14. Stripe, **Connect para marketplaces**: https://stripe.com/es/connect/marketplaces
15. Apple Developer, **App Review Guidelines**: https://developer.apple.com/app-store/review/guidelines/es/
16. Google Play, **Política de pagos**: https://support.google.com/googleplay/android-developer/answer/10281818?hl=es-ES
17. Google Search Central, **Datos estructurados de producto**: https://developers.google.com/search/docs/appearance/structured-data/product?hl=es

