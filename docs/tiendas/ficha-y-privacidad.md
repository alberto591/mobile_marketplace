# Ficha de tiendas y formularios de privacidad — BuscaPiezas 24H

Borrador para App Store Connect y Google Play Console. Revisado contra el código a 2026-11-19.
Si cambia lo que la app recoge (cuentas, SDK de analítica, anuncios, ubicación…), hay que actualizar
las secciones 3 y 4 **y** volver a enviar los formularios en las dos tiendas.

---

## 1. Datos básicos

| Campo | Valor |
|---|---|
| Nombre de la app | BuscaPiezas 24H |
| Subtítulo (iOS, máx. 30) | Recambios de desguace en 24 h |
| Bundle id / package | `com.buscapiezas24h.recambios` |
| Categoría principal | Compras (iOS: Shopping · Android: Compras) |
| Categoría secundaria (iOS) | Utilidades |
| Idioma principal | Español (España) |
| Países | Solo España (los envíos a Canarias, Ceuta y Melilla no están disponibles) |
| Precio | Gratis, sin compras dentro de la app (los pagos de piezas físicas van por Stripe, no por Apple/Google) |
| Clasificación por edades | 4+ (iOS) / PEGI 3 (Android): sin contenido sensible |
| Web de soporte | https://buscapiezas24h.vercel.app |
| URL de privacidad | https://buscapiezas24h.vercel.app/legal/privacidad |
| Email de contacto | admin@loopinnova.es |

> Antes de enviar: la política de privacidad todavía muestra "[pendiente de completar]" en NIF y
> domicilio (`apps/mobile/content/legal.ts`). Apple y Google pueden rechazar la app si la política
> está incompleta.

## 2. Textos de la ficha

**Texto promocional (iOS, máx. 170)**
Busca piezas usadas originales en desguaces profesionales autorizados (CAT). Fotos reales, precio con IVA y envío calculado antes de pagar.

**Descripción corta (Android, máx. 80)**
Piezas usadas originales de desguaces CAT, con fotos reales y envío claro.

**Descripción completa**

¿Necesitas un faro, un alternador o un retrovisor y no quieres pagar la pieza nueva? BuscaPiezas 24H reúne el inventario de desguaces profesionales autorizados (CAT) para que encuentres la pieza desde el móvil, sin llamar a varios sitios.

• Busca por nombre, por referencia OEM o por marca, modelo y año.
• Fotos reales de cada pieza y del vehículo del que procede.
• Te decimos qué respalda la compatibilidad: coincidencia de referencia OEM o solo datos del vehículo. Si no está confirmada, lo verás claro.
• Precio con IVA y coste de envío calculado por peso antes de pagar.
• Compra con tarjeta de forma segura o pregunta al desguace por la disponibilidad.
• Guarda tu coche en "Mi garaje" y tus piezas favoritas.
• Sigue tu pedido: el desguace marca el envío y recibes el número de seguimiento.

Cada pieza la vende directamente el desguace, que es el vendedor legal y responde de la garantía. Comprar usado original ahorra dinero y alarga la vida útil de las piezas.

**Palabras clave (iOS, máx. 100 caracteres, separadas por comas)**
desguace,recambios,piezas usadas,coche,OEM,faro,alternador,retrovisor,motor,CAT,segunda mano

**Novedades de la versión 1.0.0**
Primera versión: búsqueda de piezas, compra con envío calculado, consultas al desguace y seguimiento de pedidos.

## 3. Apple — Privacidad de la app (App Store Connect → Privacidad de la app)

¿Recogéis datos? **Sí.** ¿Se usan para rastrear (tracking)? **No** — no hay SDK de publicidad ni se cruzan datos con terceros, así que **no hace falta ATT** (pedir permiso de rastreo).

| Tipo de dato (Apple) | Se recoge | Vinculado a la persona | Rastreo | Finalidad |
|---|---|---|---|---|
| Información de contacto → Nombre | Sí (checkout y consulta) | Sí | No | Funcionalidad de la app |
| Información de contacto → Email | Sí | Sí | No | Funcionalidad de la app |
| Información de contacto → Teléfono | Sí | Sí | No | Funcionalidad de la app |
| Información de contacto → Dirección física | Sí (envío) | Sí | No | Funcionalidad de la app |
| Compras → Historial de compras | Sí (pedidos) | Sí | No | Funcionalidad de la app |
| Contenido del usuario → Otro contenido | Sí (mensaje de la consulta) | Sí | No | Funcionalidad de la app |
| Uso → Interacción con el producto | Sí (búsquedas y clics, con un id de sesión aleatorio) | No | No | Analítica |
| Búsquedas → Historial de búsqueda | Sí (texto buscado) | No | No | Analítica |
| Información financiera → Datos de pago | **No** la recoge la app: la tarjeta va directa a Stripe | — | — | — |
| Ubicación, identificadores de dispositivo, contactos, salud | No | — | — | — |

Notas:
- Favoritos, "Mi garaje", carrito e historial de pedidos se guardan **solo en el dispositivo**
  (AsyncStorage): no cuentan como datos recogidos.
- Apple trata los datos de pago que van a un procesador externo (Stripe) como no recogidos por la app.

## 4. Google Play — Seguridad de los datos

- ¿Recoge o comparte datos? **Sí, recoge.** ¿Comparte con terceros? **Sí, de forma limitada**: el
  pedido (nombre, dirección, teléfono, email) se envía al desguace vendedor para preparar el envío;
  Google lo cuenta como "compartir". Stripe actúa como procesador de pagos (no cuenta como compartir).
- ¿Datos cifrados en tránsito? **Sí** (todo va por HTTPS).
- ¿El usuario puede pedir que se borren? **Sí**, escribiendo a admin@loopinnova.es (no hay cuentas).
  Google exige además un **enlace web para solicitar el borrado**: se puede usar la página de
  privacidad si incluye ese procedimiento.

| Categoría (Google) | Dato | Recogido | Compartido | Obligatorio | Finalidad |
|---|---|---|---|---|---|
| Información personal | Nombre | Sí | Sí (desguace) | Sí para comprar | Funcionalidad de la app |
| Información personal | Email | Sí | Sí (desguace) | Sí para comprar | Funcionalidad, comunicaciones |
| Información personal | Teléfono | Sí | Sí (desguace) | Sí para comprar | Funcionalidad de la app |
| Información personal | Dirección | Sí | Sí (desguace) | Sí para comprar | Funcionalidad de la app |
| Información financiera | Historial de compras | Sí | Sí (desguace) | Sí | Funcionalidad de la app |
| Mensajes | Otros mensajes en la app (consulta) | Sí | Sí (desguace) | Opcional | Funcionalidad de la app |
| Actividad en apps | Interacciones, historial de búsqueda | Sí | No | Automático | Analíticas |
| Información financiera | Datos de pago | Lo gestiona Stripe | — | — | — |

## 5. Material gráfico pendiente

- [ ] **Icono 1024×1024** sin transparencia (iOS) y **512×512** (Google Play); partir de `apps/mobile/assets/icon.png`.
- [ ] **Imagen destacada Android 1024×500.**
- [ ] **Capturas iPhone 6,9"** (1320×2868), mínimo 3: inicio/búsqueda, resultados, ficha de pieza, carrito/checkout, "Mis pedidos".
- [ ] **Capturas iPad 13"** (2064×2752), solo porque `supportsTablet: true`; si no se quiere hacer, poner `supportsTablet: false`.
- [ ] **Capturas Android** de teléfono (mínimo 2, 1080×1920 o más).

## 6. Revisión de Apple — notas para el revisor

Los pagos de piezas físicas con Stripe están permitidos (guía 3.1.3(e): bienes físicos), así que no
hay que usar compras dentro de la app. Conviene dejar en "Notas para la revisión":

> La app vende piezas de coche físicas que envía un desguace; el pago se hace con Stripe porque se
> trata de bienes físicos. No requiere iniciar sesión. Para probar una compra en el entorno de
> pruebas, usa la tarjeta 4242 4242 4242 4242 con cualquier fecha futura y CVC.

(Solo vale si la build que se revisa sigue en modo test de Stripe; con claves reales, quitar la frase
de la tarjeta.)
