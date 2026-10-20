# Guía de Pruebas Manuales: Validación de Catálogo Real en Staging

- **Proyecto:** `mobile-marketplace`
- **Entorno de pruebas:** Supabase Staging (`lmsjgxhzfksyrlxyqndd`)
- **Inventario congelado:** 114 piezas reales de Eurodesguace Málaga S.L.
- **Fecha de preparación:** 2026-10-20
- **Versión:** Paso 9 — Validación de Usuario

---

## 1. Configuración del Entorno de Ejecución

### 1.1. Verificación de Versiones y Dependencias
Antes de arrancar la aplicación, comprueba desde la raíz del proyecto:
```bash
# 1. Comprobar Node.js (requerido >= 18, actual verificado: v24.7.0)
node -v

# 2. Comprobar npm (actual verificado: 11.5.1)
npm -v

# 3. Comprobar dependencias instaladas en workspaces
npm run typecheck
```

### 1.2. Configuración de Variables de Entorno Públicas
Asegúrate de que el archivo `.env.local` en la raíz (o en `apps/mobile/.env.local`) contiene exclusivamente las variables públicas de conexión con staging:
```bash
EXPO_PUBLIC_SUPABASE_URL=https://lmsjgxhzfksyrlxyqndd.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<tu_supabase_anon_key_publica>
EXPO_PUBLIC_CATALOG_DATA_SOURCE=backend
```
> **Nota de Seguridad:** Ninguna clave privada (`EURODESGUACE_API_KEY`, `SYNC_ADMIN_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) debe figurar en el cliente móvil.

### 1.3. Opciones de Ejecución

#### Opción A: Probar en iPhone Físico mediante Expo Go (Recomendado)
1. Instala la app **Expo Go** desde el App Store en tu iPhone.
2. Asegúrate de que el iPhone y el Mac están conectados a la misma red Wi-Fi (o utiliza el modo `--tunnel`).
3. Inicia el servidor de desarrollo de Expo desde la raíz:
   ```bash
   npm run start -w @mobile-marketplace/mobile
   ```
4. Abre la app **Cámara** en tu iPhone y escanea el código QR mostrado en la terminal de Metro.
5. Se abrirá la aplicación directamente en Expo Go cargando los 1193 módulos compilados.

#### Opción B: Probar con Simulador iOS
1. Requisito previo: Disponer de Xcode completo instalado en `/Applications/Xcode.app` con las Command Line Tools activadas (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`).
2. En la terminal donde se ejecuta Expo, pulsa la tecla `i` para abrir automáticamente el simulador iOS.

#### Opción C: Comprobar el Origen del Catálogo en Tiempo Real
En la consola de Metro o inspeccionando las llamadas de red:
- Las consultas deben dirigirse hacia `https://lmsjgxhzfksyrlxyqndd.supabase.co/rest/v1/public_catalog_parts`.
- En ningún caso deben aparecer piezas de `Desguace Alpha Madrid` ni de `Desguaces Madrid Norte` (exclusivas del modo `mock`).

---

## 2. Casos de Prueba Manuales

---

### Módulo 1: Búsqueda de Recambios

#### CP-BUSQ-01: Búsqueda textual por término común («CALEFACCION»)
- **Objetivo:** Verificar que el buscador recupera recambios reales coincidentes en el título.
- **Pasos:**
  1. Abrir la app en la pantalla inicial del buscador.
  2. En el campo «¿Qué pieza necesitas?», escribir `CALEFACCION`.
  3. Pulsar el botón «Buscar recambios».
- **Resultado Esperado:** Se abre la pantalla de resultados mostrando las 3 piezas reales que contienen «CALEFACCION» en su título (Mando Citroën Nemo, Resistencia calefacción Nissan Cabstar, Centralita calefacción).
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-BUSQ-02: Búsqueda por descripción de pieza conocida («ELEVALUNAS»)
- **Objetivo:** Comprobar la recuperación de una pieza del lote ampliado (ref 91032).
- **Pasos:**
  1. En el buscador, escribir `ELEVALUNAS`.
  2. Pulsar «Buscar recambios».
- **Resultado Esperado:** Aparece al menos el «MOTOR ELEVALUNAS DELANTERO IZQUIERDO» (ref 91032) con precio de 27,95 EUR y fotografía miniatura visible.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-BUSQ-03: Búsqueda por referencia visual («5073401000013»)
- **Objetivo:** Probar el campo de búsqueda por referencia del desguace.
- **Pasos:**
  1. En la pantalla inicial, introducir en el campo «Referencia OEM / Troquelada» el valor `5073401000013`.
  2. Pulsar «Buscar recambios».
- **Resultado Esperado:** Se recupera el mando de calefacción del Citroën Nemo (ref 91010). La tarjeta muestra la etiqueta `Ref. Visual: 5073401000013`.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-BUSQ-04: Búsqueda sin resultados («PIEZA_INEXISTENTE_XYZ»)
- **Objetivo:** Verificar que las consultas sin coincidencia muestran una interfaz limpia y honesta.
- **Pasos:**
  1. En el buscador, escribir `PIEZA_INEXISTENTE_XYZ`.
  2. Pulsar «Buscar recambios».
- **Resultado Esperado:**
  - Aparece el componente `EmptyState` con el título «No se encontraron piezas».
  - El mensaje indica de forma honesta que no hay recambios disponibles para ese término.
  - No se generan ni muestran piezas simuladas o ficticias.
  - Se ofrecen los botones «Modificar búsqueda» y «Restablecer filtros».
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-BUSQ-05: Limpiar formulario de búsqueda
- **Objetivo:** Verificar que el botón de limpieza restablece todos los campos.
- **Pasos:**
  1. Escribir texto en los campos de pieza, referencia, marca, modelo y año.
  2. Pulsar el botón «Limpiar campos».
- **Resultado Esperado:** Todos los inputs quedan completamente vacíos y listos para una nueva consulta.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

### Módulo 2: Pantalla de Resultados

#### CP-RES-01: Verificación de pertenencia al catálogo real de staging
- **Objetivo:** Asegurar que todos los resultados provienen exclusivamente de staging.
- **Pasos:**
  1. Realizar una búsqueda genérica (dejar en blanco los filtros y buscar o pulsar un acceso rápido).
  2. Inspeccionar las tarjetas de recambios mostradas.
- **Resultado Esperado:** Todas las piezas muestran como vendedor «Eurodesguace Málaga», placa de centro autorizado CAT verificada y precios exactos en euros con IVA. No aparece ninguna referencia a proveedores de mock.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-RES-02: Ordenación por precio ascendente y descendente
- **Objetivo:** Comprobar que la ordenación sobre los datos reales opera correctamente.
- **Pasos:**
  1. En la pantalla de resultados, buscar `CALEFACCION`.
  2. Seleccionar la opción de orden «Precio menor».
- **Resultado Esperado:** Las 3 piezas se reordenan de menor a mayor precio:
  1. 27,95 EUR (Resistencia calefacción Nissan Cabstar)
  2. 32,95 EUR (Centralita calefacción)
  3. 42,95 EUR (Mando Citroën Nemo)
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-RES-03: Filtrado por disponibilidad («En stock»)
- **Objetivo:** Validar el selector de piezas disponibles.
- **Pasos:**
  1. En los resultados, pulsar la píldora «En stock».
- **Resultado Esperado:** La lista filtra únicamente aquellas piezas con disponibilidad activa (`AVAILABLE`), excluyendo cualquier recambio retirado o agotado.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-RES-04: Ausencia de ofertas simuladas en modo backend
- **Objetivo:** Garantizar que no se mezclan ofertas mock cuando el modo backend está activado.
- **Pasos:**
  1. Revisar los desguaces vendedores en todas las tarjetas del listado.
- **Resultado Esperado:** Únicamente aparece «Eurodesguace Málaga». «Desguace Alpha Madrid» o «Desguaces Madrid Norte» no deben aparecer bajo ninguna circunstancia.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-RES-05: Estados de carga (Loading Skeleton/Spinner)
- **Objetivo:** Comprobar la respuesta visual durante la petición de red.
- **Pasos:**
  1. Ejecutar una búsqueda nueva.
- **Resultado Esperado:** Durante el tiempo de respuesta del servidor (aproximadamente 200–500 ms), se muestra el indicador `ActivityIndicator` con el texto «Buscando en catálogo de desguaces...» sin saltos bruscos de diseño.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

### Módulo 3: Ficha Detallada de Producto

#### CP-DET-01: Ficha técnica completa de pieza real (Mando ref 91010)
- **Objetivo:** Validar la exhaustividad de datos en la pantalla de detalle.
- **Pasos:**
  1. En el listado, pulsar sobre la pieza `91010` («MANDO CALEFACCION / AIRE ACONDICIONADO»).
- **Resultado Esperado:**
  - Título: «MANDO CALEFACCION / AIRE ACONDICIONADO».
  - Precio: «42,95 EUR» (IVA incluido).
  - Vendedor: «Eurodesguace Málaga S.L.» (código CAT/AND/MA/0412, Alhaurín de la Torre).
  - Vehículo donante: CITROEN NEMO con código donante indicado.
  - Garantía: 12 meses legal según RD 265/2021.
  - Plazo de devolución: 14 días naturales.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-DET-02: Galería de imágenes reales
- **Objetivo:** Comprobar la navegación de fotografías de la pieza física.
- **Pasos:**
  1. En la ficha de la pieza `91010` o `91032`, observar la galería superior.
  2. Pulsar sobre las miniaturas inferiores para alternar entre fotos.
- **Resultado Esperado:**
  - Se visualizan las fotografías reales de la pieza en el desguace servidas desde CDN seguro (HTTPS).
  - La imagen principal cambia al pulsar cada miniatura.
  - El selector indica el índice actual (ej. `1 / 4`).
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-DET-03: Etiquetado de referencia visual vs OEM oficial
- **Objetivo:** Comprobar la honestidad en la atribución de referencias.
- **Pasos:**
  1. En la ficha de la pieza `91010`, desplazarse a la sección «Referencias de la pieza».
- **Resultado Esperado:**
  - La referencia `5073401000013` está etiquetada como **«Referencia visual del proveedor»**.
  - Se incluye la aclaración explícita: *(Lectura de etiqueta/troquelado · No verificada como OEM oficial)*.
  - NO aparece como «Referencia OEM oficial».
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-DET-04: Insignia de compatibilidad no garantizada
- **Objetivo:** Verificar que las referencias visuales no otorgan compatibilidad garantizada.
- **Pasos:**
  1. Observar la insignia de compatibilidad en la cabecera de la ficha.
- **Resultado Esperado:**
  - Muestra el texto explicativo indicando que la coincidencia se basa en lectura visual o atributos del donante, pero **NO está garantizada como OEM oficial**.
  - No muestra la insignia verde de «Compatibilidad garantizada».
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-DET-05: Aviso de disponibilidad pendiente de confirmación
- **Objetivo:** Comprobar la advertencia legal de stock de desguace.
- **Pasos:**
  1. Desplazarse a la sección inferior de la ficha de cualquier pieza.
- **Resultado Esperado:** Aparece el texto visible: *«Aviso de disponibilidad: El inventario del CAT se actualiza con frecuencia diaria. La disponibilidad final en el almacén físico debe ser confirmada previamente por el vendedor.»*
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-DET-06: Modal de consulta al desguace (Sin falsos envíos)
- **Objetivo:** Verificar el diálogo de consulta al vendedor y su honestidad en staging.
- **Pasos:**
  1. En la barra flotante inferior, pulsar el botón «Consultar disponibilidad».
  2. Rellenar los campos requeridos (Nombre y Teléfono/Email).
  3. Pulsar «Enviar consulta».
- **Resultado Esperado:**
  - Se abre el modal con el resumen de la pieza y del vendedor.
  - Tras pulsar enviar, la pantalla de confirmación indica claramente:
    *«[Modo prueba / Prototipo]: Los datos para consultar la pieza han sido registrados localmente en la interfaz. En esta fase de staging no se realiza envío telemático externo al CAT ni se bloquea stock físico.»*
  - No finge haber cursado un cobro, reserva o envío telemático al CAT.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

### Módulo 4: Tratamiento de Errores y Resiliencia (Fail-Fast)

#### CP-ERR-01: Caída de red simulada en resultados
- **Objetivo:** Verificar que un fallo de conexión muestra la pantalla de error y no fixtures mock.
- **Pasos:**
  1. En el dispositivo o simulador, activar el Modo Avión o desconectar temporalmente el Wi-Fi.
  2. Realizar una búsqueda en la app.
- **Resultado Esperado:**
  - La pantalla muestra el componente `EmptyState` con título: «Fallo de conexión con el catálogo».
  - El mensaje indica: *«No se pudo conectar con el catálogo en vivo: ... Por honestidad en el inventario, no se muestran recambios ficticios.»*
  - Se visualizan los botones «Reintentar búsqueda» y «Volver al buscador».
  - Bajo ningún concepto se devuelven piezas simuladas para disimular la caída.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-ERR-02: Reintento tras restablecer la conexión
- **Objetivo:** Comprobar la recuperación del servicio tras solucionar el problema de red.
- **Pasos:**
  1. Continuando desde el caso anterior, reconectar el Wi-Fi en el dispositivo.
  2. Pulsar el botón «Reintentar búsqueda».
- **Resultado Esperado:** La aplicación vuelve a conectar con Supabase Staging y muestra los recambios reales sin necesidad de reiniciar la app.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-ERR-03: Consulta de pieza con identificador erróneo o borrado
- **Objetivo:** Verificar el manejo de 404 al consultar una pieza que no existe en staging.
- **Pasos:**
  1. Forzar una navegación hacia un ID inexistente (ej. `00000000-0000-0000-0000-000000000000`).
- **Resultado Esperado:** La ficha muestra «Pieza no encontrada: No se ha podido localizar este recambio en el inventario actual de los desguaces colaboradores», sin bloquear la aplicación.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

### Módulo 5: Usabilidad e Interfaz Móvil

#### CP-USA-01: Legibilidad y contraste en pantalla
- **Objetivo:** Asegurar que los textos, precios y badges se leen con claridad en dispositivos móviles.
- **Pasos:**
  1. Revisar la pantalla principal, el listado y el detalle en condiciones de luz normal y reducida.
- **Resultado Esperado:** Tipografía legible (jerarquía clara, tamaños adecuados), precios destacados en color acento con indicación de IVA, y contraste adecuado sobre fondo oscuro/claro.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

#### CP-USA-02: Respuesta de elementos táctiles y barra inferior flotante
- **Objetivo:** Comprobar que los botones y tarjetas responden con fluidez.
- **Pasos:**
  1. Pulsar tarjetas en el listado.
  2. Desplazarse por la ficha de pieza y comprobar que la barra inferior flotante con el precio y botón de consulta permanece fija sin tapar el contenido inferior.
- **Resultado Esperado:** La navegación es fluida, las pulsaciones tienen respuesta visual inmediata y el scroll content tiene padding inferior suficiente (`paddingBottom: 110`) para no solaparse con la barra flotante.
- **Estado:** `[ ] PASS` · `[ ] FAIL` · `[ ] BLOCKED`
- **Notas/Observaciones:**

---

## 3. Registro de Ejecución y Resumen

| Módulo | Casos Totales | PASS | FAIL | BLOCKED |
|---|---|---|---|---|
| **1. Búsqueda** | 5 | | | |
| **2. Resultados** | 5 | | | |
| **3. Ficha de Producto** | 6 | | | |
| **4. Errores y Resiliencia** | 3 | | | |
| **5. Usabilidad** | 2 | | | |
| **TOTAL** | **21** | | | |

- **Probador:** ___________________________
- **Dispositivo / OS:** ___________________________
- **Fecha de ejecución:** ___________________________
- **Veredicto global:** `[ ] APROBADO PARA ESCALAR` · `[ ] REQUIERE CORRECCIONES`
