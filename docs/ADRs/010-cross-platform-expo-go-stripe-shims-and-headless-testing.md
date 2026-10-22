# ADR 010: Compatibilidad Multiplataforma Expo Go, Shims Condicionales de Stripe y Testing Headless en Node.js

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Decisores:** Principal Mobile Architect / QA Automation Lead / Senior Tooling Engineer
- **Componentes Afectados:**
  - [whatsapp-contact.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/whatsapp-contact.service.ts)
  - [share-part.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/share-part.service.ts)
  - [stripe-client.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/stripe-client.tsx)
  - [stripe-web-shim.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/stripe-web-shim.tsx)
  - [vitest.config.mjs](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/vitest.config.mjs)
  - [cart.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/app/cart.tsx)
  - [PartCard.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/PartCard.tsx)
- **Documentos Relacionados:**
  - [ADR 004: Lectura Segura de Catálogo Persistido, Separación de Entornos y Desacoplamiento de Mocks](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/004-backend-catalog-persistence-and-secure-client-access.md)
  - [ADR 008: Checkout Transaccional Marketplace con Stripe Connect Direct Charges, Retención de Comisión (Application Fee) y Bloqueo de Modo Live](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/008-transactional-checkout-v2-stripe-connect-direct-charges.md)
  - [ADR 009: Arquitectura de Experiencia Movil BuscaPiezas 24H, Economia Circular y Verificacion Legal CAT (RD 265/2021)](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/009-buscapiezas-mvp-mobile-experience-and-circular-economy.md)

---

## 1. Contexto y Definicion del Problema

El desarrollo y evaluación ágil de la aplicación móvil sobre dispositivos físicos requiere soportar la ejecución directa en **Expo Go** (para pruebas en caliente en iPhones sin compilar binarios Xcode continuos), compilaciones nativas de producción (`expo-dev-client`) y plataformas web/headless.

Durante las pruebas reales sobre iPhone físico en Expo Go, surgieron incidencias críticas de ejecución:
1. **Fallo por Importación Dinámica en Metro (`Invariant Violation`):**
   El uso de importaciones dinámicas asíncronas (`await import('react-native')`) para invocar servicios nativos como `Linking` o `Share` forzaba al empaquetador Metro a evaluar el archivo raíz `react-native/index.js`. Dicho archivo inicializa módulos nativos heredados (`PushNotificationIOS`, `ProgressBarAndroid`) que **no existen en el sandbox de Expo Go**, provocando un cierre inesperado con la excepción:
   *`Your JavaScript code tried to access a native module that doesn't exist. Invariant Violation in NativeEventEmitter`*.
2. **Incompatibilidad de `@stripe/stripe-react-native` en Entornos Web y Pruebas Unitarias:**
   La biblioteca oficial del SDK de Stripe requiere puentes nativos (iOS Pods y Android Gradle). Si se importa incondicionalmente en entornos de pruebas automatizadas en Node.js o en la web, el motor de ejecución arroja excepciones fatales al no encontrar las APIs de Cocoa/Java.
3. **Imposibilidad de Ejecutar Pruebas Unitarias de Servicios Móviles con Vitest en Node.js:**
   El código fuente de `react-native` contiene sintaxis específica de Flow que Node.js no puede interpretar sin transformadores pesados, lo que impedía ejecutar pruebas automatizadas rápidas de servicios de carrito, garaje, favoritos y trust.
4. **Colisiones Visuales de Interfaz en Dispositivos iOS con Home Indicator:**
   La barra inferior de navegación y botones fijos de tramitación de pedidos solapaban con la franja de gestos de los dispositivos iPhone modernos si no se respetaban las áreas seguras (*SafeAreaInsets*).

---

## 2. Factores Decisivos (Decision Drivers)

1. **Compatibilidad Plena e Inmediata con Expo Go:** Cero errores de módulos nativos inexistentes al interactuar con WhatsApp, compartir recambios o navegar por la aplicación.
2. **Ejecución Ultrarrápida de Pruebas Unitarias Headless:** Capacidad de ejecutar 88 pruebas unitarias en `apps/mobile` en menos de 2 segundos mediante Vitest en Node.js puro, sin emuladores, sin simuladores y sin dependencias de Xcode.
3. **Aislamiento Multiplataforma para Stripe:** Carga condicional del proveedor de Stripe en dispositivos nativos y provisión de un shim transparente para entornos web y tests.
4. **Diseño Adaptativo a Áreas Seguras (SafeAreaInsets):** Respeto riguroso de la barra de estado superior y la barra de navegación gestual inferior en iOS y Android.
5. **Cero Mocks Ocultos en Producción (Fail Fast):** Toda separación de entornos debe realizarse mediante inyección explícita y shims tipados, sin silenciar errores legítimos de red o de negocio.

---

## 3. Opciones Consideradas

### Opción A: Exigir Compilaciones Nativas Exclusivas (`npx expo run:ios` / Prebuild)
Eliminar la compatibilidad con Expo Go y obligar a todos los ingenieros y evaluadores a compilar binarios nativos completos mediante Xcode/CocoaPods.
- **Ventajas:** Permite enlazar cualquier biblioteca nativa C++/Objective-C directamente.
- **Desventajas:** Tiempos de compilación de 10-15 minutos por ciclo; impide a evaluadores externos probar la app escaneando un simple código QR en su iPhone; inviable para iteración rápida.

### Opción B: Implementación de Mocks Globales Fragiles en Jest
Utilizar Jest con configuraciones complejas de mocks manuales para emular cada módulo de React Native.
- **Ventajas:** Tradicional en proyectos antiguos.
- **Desventajas:** Muy lento en monorrepositorios; fragilidad constante ante actualizaciones de dependencias; no resuelve el fallo en ejecución física real de Expo Go.

### Opción C: Arquitectura de Importaciones Estáticas Selectivas, Shimming Condicional de Stripe y Aliasing a `react-native-web` en Vitest (Seleccionada)
1. Sustituir las importaciones dinámicas en caliente por importaciones estáticas con nombre (`import { Linking, Share } from 'react-native'`).
2. Implementar una capa de abstracción ([stripe-client.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/stripe-client.tsx) / [stripe-web-shim.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/stripe-web-shim.tsx)) que comprueba `Platform.OS` y monta el componente real de Stripe solo en terminales móviles.
3. Configurar [vitest.config.mjs](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/vitest.config.mjs) con un alias de resolución: `resolve.alias: { 'react-native': 'react-native-web' }`.
4. Integrar `useSafeAreaInsets` en los contenedores de acción inferior.
- **Ventajas:** Resuelve de raíz los fallos de `Invariant Violation` en Expo Go; pruebas automatizadas pasando en milisegundos; experiencia visual impecable en iPhone físico.
- **Compromisos de Diseño (Trade-offs):** Requiere tipar explícitamente las interfaces de los shims de Stripe para mantener el tipado TypeScript estricto.

---

## 4. Decisión Adoptada

Se adopta la **Opción C: Importaciones Selectivas, Shimming Condicional y Aliasing a react-native-web**.

### 4.1 Desacoplamiento de Servicios Móviles de Expo Go

En [whatsapp-contact.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/whatsapp-contact.service.ts) y [share-part.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/share-part.service.ts):
- Se eliminó: `const { Linking } = await import('react-native');` (que provocaba la evaluación del índice raíz con `PushNotificationIOS`).
- Se implementó: `import { Linking, Share } from 'react-native';` a nivel de cabecera de módulo. El transformador Babel de Metro extrae los paquetes específicos sin evaluar las dependencias nativas incompatibles de Expo Go.

### 4.2 Arquitectura del Shim de Stripe

1. **[stripe-client.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/stripe-client.tsx):**
   Punto de entrada único para la inicialización del cliente de pagos:
   - En Android e iOS nativo, exporta `StripeProvider` y hooks reales de `@stripe/stripe-react-native`.
   - En Web o entornos sin soporte, redirige al shim seguro.

2. **[stripe-web-shim.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/stripe-web-shim.tsx):**
   Proporciona componentes y hooks sustitutivos que respetan el contrato de interfaz:
   ```typescript
   export const StripeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
   export const useStripe = () => ({
     initPaymentSheet: async () => ({ error: undefined }),
     presentPaymentSheet: async () => ({ error: { message: 'Plataforma web: utilice pasarela Stripe Checkout' } }),
   });
   ```

### 4.3 Estrategia de Pruebas Unitarias Headless con Vitest

En [vitest.config.mjs](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/vitest.config.mjs):
```javascript
export default defineConfig({
  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
```
Al resolver contra `react-native-web`, Vitest procesa `AsyncStorage`, `Linking` y utilidades de plataforma con JavaScript estándar compilado para Node.js, permitiendo ejecutar las 88 pruebas unitarias del cliente móvil con velocidad instantánea.

### 4.4 Adaptabilidad a Áreas Seguras (SafeAreaInsets)

En [cart.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/app/cart.tsx):
Se introduce `useSafeAreaInsets()` calculando el espaciado inferior dinámico:
```typescript
const insets = useSafeAreaInsets();
// paddingBottom ajustado dinamicamente para librar el Home Indicator
<View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
```
Eliminando de forma definitiva el solapamiento con el marco inferior del sistema operativo.

---

## 5. Consecuencias

### Positivas
- **Estabilidad en Dispositivos Físicos:** Cero cuelgues o cierres inesperados en Expo Go 57 sobre iOS y Android al pulsar WhatsApp o Compartir.
- **Eficiencia en CI/CD:** Suite de 193 pruebas automatizadas completada en 1,8 segundos en cualquier entorno sin dependencias de emuladores móviles.
- **Portabilidad Multiplataforma:** La misma base de código opera de forma idéntica en Expo Go, compilaciones de producción y previsualizaciones web.

### Riesgos Residuales y Mitigaciones
- **Riesgo:** Un desarrollador podría reintroducir inadvertidamente una importación dinámica de `react-native` en un servicio futuro.
  - *Mitigacion:* Las pruebas automatizadas de integración continua y la auditoría de TypeScript estricto validan las dependencias en cada Pull Request.
