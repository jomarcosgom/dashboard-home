# 🏠 SmartHome Dashboard — Plan de Implementación

Dashboard web (PWA) premium para control domótico familiar, con datos simulados inicialmente y arquitectura preparada para integración real progresiva.

## Inventario de Dispositivos

| Dispositivo | Marca | App Actual | API Disponible |
|---|---|---|---|
| Luces | Ledvance (Bluetooth) | Ledvance App | ⚠️ Bluetooth — sin API cloud directa |
| Aire Acondicionado (nuevo) | LG | LG ThinQ | ✅ LG ThinQ API (OAuth2) |
| Aire Acondicionado (antiguo) | LG | Sin app | ❌ Sin conectividad — necesitaría IR blaster |
| Cámara de seguridad | TP-Link Tapo | Tapo App | ⚠️ API local limitada (no oficial) |
| Alarma | SmartLife/Tuya | Smart Life App | ✅ Tuya Cloud API |
| Termostato | Meross | Meross App | ✅ Meross Cloud API |
| Telefonillo | Ring | Ring App | ⚠️ API no oficial (Ring tiene API limitada) |

> [!NOTE]
> **Fase 1** será un dashboard visual con datos simulados. La integración real con APIs se hará progresivamente en fases posteriores. La arquitectura estará preparada para ello desde el inicio.

## User Review Required

> [!IMPORTANT]
> **Luces Ledvance por Bluetooth**: Las luces Bluetooth no se pueden controlar desde una web (los navegadores no exponen BLE de forma fiable). Para integrarlas en el futuro necesitarías uno de estos:
> - Un **hub Ledvance/OSRAM Smart+** que las conecte a WiFi
> - Migrar a un **gateway Zigbee** (ej. ConBee II + Home Assistant)
> - Usar un **controlador IR/RF** como intermediario

> [!IMPORTANT]
> **Aire acondicionado antiguo sin app**: Para controlarlo necesitarías un **controlador IR universal** como Broadlink RM4, Sensibo, o Tado que emule el mando a distancia y exponga una API.

## Propuesta de Diseño

### Estilo Visual
- **Dark mode** como modo principal (premium, moderno, ahorro de batería OLED)
- **Glassmorphism** con tarjetas semitransparentes y blur
- **Gradientes sutiles** con paleta de colores cálidos (naranja/ámbar para calefacción, azul para AC, amarillo para luces)
- **Micro-animaciones** en controles (sliders, toggles, transiciones)
- **Iconografía moderna** con animaciones SVG (ej. el AC "sopla" cuando está encendido)
- **Tipografía**: Inter o Outfit desde Google Fonts
- **Layout responsive**: Optimizado para móvil primero, se adapta a tablet/desktop

### Pantallas Principales

1. **🏠 Dashboard Principal** — Vista general de toda la casa
   - Temperatura actual y clima exterior
   - Estado rápido de todos los dispositivos (ON/OFF)
   - Tarjetas resumen por habitación
   - Accesos rápidos a los dispositivos más usados

2. **💡 Control de Luces** — Panel dedicado
   - Toggle ON/OFF por habitación
   - Slider de brillo
   - Selector de color/temperatura (para luces que lo soporten)
   - Escenas predefinidas (cine, lectura, cena, etc.)

3. **❄️ Climatización** — Aires acondicionados + Termostato
   - Control de temperatura con dial circular premium
   - Modos: frío, calor, auto, ventilador
   - Estado del termostato Meross con gráfica de temperatura
   - Programación horaria visual

4. **🔒 Seguridad** — Cámara + Alarma + Ring
   - Vista de cámara Tapo (placeholder/stream cuando se integre)
   - Estado de alarma SmartLife (armada/desarmada)
   - Último evento del Ring (timbre, movimiento)
   - Historial de eventos

5. **⚙️ Configuración**
   - Gestión de habitaciones
   - Perfiles de usuario (familia)
   - Escenas y automatizaciones
   - Ajustes de la app

## Arquitectura Técnica

### Stack Tecnológico
- **HTML + CSS + JavaScript** vanilla (PWA)
- **CSS Variables** para theming y diseño responsivo
- **Service Worker** para funcionamiento offline y PWA
- **LocalStorage/IndexedDB** para persistencia de estado simulado
- **Web App Manifest** para instalación como app nativa

### Estructura del Proyecto

```
dashboard-home/
├── index.html                 # Entry point + shell de navegación
├── manifest.json              # PWA manifest
├── sw.js                      # Service Worker
├── css/
│   ├── variables.css          # Design tokens (colores, spacing, fonts)
│   ├── base.css               # Reset + estilos globales
│   ├── components.css         # Componentes reutilizables (cards, toggles, sliders)
│   ├── layouts.css            # Grid layouts responsivos
│   └── animations.css         # Micro-animaciones y transiciones
├── js/
│   ├── app.js                 # Inicialización y routing SPA
│   ├── state.js               # Estado global de dispositivos (simulated data)
│   ├── router.js              # Navegación SPA sin recargas
│   ├── components/
│   │   ├── device-card.js     # Tarjeta de dispositivo genérica
│   │   ├── temperature-dial.js # Control circular de temperatura
│   │   ├── light-control.js   # Control de luces
│   │   ├── ac-control.js      # Control de aire acondicionado
│   │   ├── security-panel.js  # Panel de seguridad
│   │   └── weather-widget.js  # Widget de clima
│   ├── pages/
│   │   ├── dashboard.js       # Página principal
│   │   ├── lights.js          # Página de luces
│   │   ├── climate.js         # Página de climatización
│   │   ├── security.js        # Página de seguridad
│   │   └── settings.js        # Configuración
│   └── services/
│       ├── device-service.js  # Abstracción para APIs de dispositivos
│       ├── weather-service.js # API de clima real (OpenWeatherMap)
│       └── storage.js         # Persistencia local
├── assets/
│   ├── icons/                 # Iconos de la app y dispositivos
│   └── images/                # Imágenes de la app
└── pages/                     # Templates HTML de cada vista
```

### Capa de Servicios (preparada para integración real)

```javascript
// Patrón: cada dispositivo implementa una interfaz común
// En Fase 1: datos simulados
// En Fase 2+: se reemplaza por llamadas API reales

DeviceService {
  getDevices()        → lista de dispositivos
  getDevice(id)       → estado de un dispositivo  
  setDeviceState(id, state)  → cambiar estado
  getHistory(id)      → historial de estados
}
```

## Fases de Desarrollo

### 📦 Fase 1 — Dashboard Visual (ESTA FASE)
- Estructura HTML/CSS completa
- Diseño premium dark mode con glassmorphism
- Todas las pantallas con navegación SPA
- Datos simulados realistas
- PWA instalable
- Responsive mobile-first
- Micro-animaciones y transiciones

### 📦 Fase 2 — Integración Parcial (FUTURA)
- API de clima real (OpenWeatherMap — gratuita)
- Integración Tuya Cloud (alarma SmartLife)
- Integración Meross (termostato)

### 📦 Fase 3 — Integración Completa (FUTURA)
- LG ThinQ API (aire acondicionado nuevo)
- Stream de cámara Tapo (requiere red local)
- Ring API (telefonillo)
- Notificaciones push

### 📦 Fase 4 — Automatizaciones (FUTURA)
- Escenas (ej. "Buenas noches" apaga todo)
- Programaciones horarias
- Reglas condicionales (si temp > 28°C → encender AC)

## Verificación

### Manual
- Abrir en navegador de móvil y verificar diseño responsive
- Instalar como PWA y probar navegación
- Verificar todas las interacciones (toggles, sliders, dials)
- Probar en modo offline

### Funcional
- Verificar que el estado persiste al recargar
- Verificar navegación SPA sin errores
- Validar que la PWA se instala correctamente
- Comprobar rendimiento en dispositivos móviles
