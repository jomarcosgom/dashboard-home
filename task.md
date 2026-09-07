# SmartHome Dashboard — Task List

## CSS Foundation
- [x] `css/variables.css` — Design tokens (colores HSL, glassmorphism, espaciado)
- [x] `css/base.css` — Reset + estilos globales + ambient background
- [x] `css/components.css` — Componentes reutilizables (glass-card, toggles, gauges, badges, toast)
- [x] `css/layouts.css` — Grid layouts responsive móvil/tablet/desktop
- [x] `css/animations.css` — Micro-animaciones (ripple, pulse, glow, shimmers)

## JS Infrastructure
- [x] `js/services/storage.js` — LocalStorage persistence
- [x] `js/state.js` — Reactive state management + datos simulados completos
- [x] `js/services/device-service.js` — Device abstraction layer
- [x] `js/icons.js` — Iconos SVG limpios y modernos
- [x] `js/router.js` — SPA hash-based router con transiciones

## JS Pages & Modules
- [x] `js/pages/dashboard.js` — Vista general (tiempo, clima, métricas, habitaciones, escenas, actividad)
- [x] `js/pages/lights.js` — Control de luces por habitación (toggles, brillo, escenas)
- [x] `js/pages/climate.js` — Climatización (dial táctil circular, AC LG nuevo, AC salón, termostato Meross)
- [x] `js/pages/security.js` — Seguridad (cámara Tapo en directo, alarma SmartLife, Ring telefonillo, registro)
- [x] `js/pages/settings.js` — Configuración (perfil familiar, habitaciones, reset datos, instalación PWA)

## App Shell & PWA
- [x] `js/app.js` — App init, navegación inferior, reloj dinámico y PWA install hook
- [x] `index.html` — Shell HTML5 semántico con meta tags PWA
- [x] `manifest.json` — PWA Web App Manifest (standalone, colores, scope)
- [x] `sw.js` — Service Worker con caché offline (Stale-While-Revalidate)
- [x] `assets/icons/` — Generación de iconos 192x192, 512x512 PNG y SVG vector

## Verification
- [x] Validación sintáctica JS sin errores (`node --check`)
- [x] Servidor local funcionando en `http://localhost:8080`
- [x] Verificación de respuesta HTTP 200 en todos los assets
