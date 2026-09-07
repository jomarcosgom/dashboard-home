/* ============================================================
   STATE — SmartHome Dashboard
   Reactive state management + simulated device data
   ============================================================ */

import StorageService from './services/storage.js';

/* ── Reactive State Engine ── */
class ReactiveState {
  constructor(initialState) {
    this._state = structuredClone(initialState);
    this._listeners = new Map();
    this._globalListeners = new Set();
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  }

  set(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((obj, key) => obj[key], this._state);
    const oldValue = target[last];
    target[last] = value;

    // Notify path-specific listeners
    this._listeners.forEach((callbacks, pattern) => {
      if (path.startsWith(pattern) || pattern.startsWith(path)) {
        callbacks.forEach(cb => cb(value, oldValue, path));
      }
    });

    // Notify global listeners
    this._globalListeners.forEach(cb => cb(path, value, oldValue));

    // Persist
    this._persist();
  }

  on(path, callback) {
    if (!this._listeners.has(path)) {
      this._listeners.set(path, new Set());
    }
    this._listeners.get(path).add(callback);
    return () => this._listeners.get(path)?.delete(callback);
  }

  onAny(callback) {
    this._globalListeners.add(callback);
    return () => this._globalListeners.delete(callback);
  }

  getState() {
    return structuredClone(this._state);
  }

  _persist() {
    StorageService.set('appState', this._state);
  }

  loadPersisted() {
    const saved = StorageService.get('appState');
    if (saved) {
      this._state = this._deepMerge(this._state, saved);
    }
  }

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
          && target[key] && typeof target[key] === 'object') {
        result[key] = this._deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
}

/* ── Initial State with Simulated Data ── */
const initialState = {
  user: {
    name: 'Jose',
    avatar: 'JM',
    family: ['Jose', 'Pareja', 'Niños']
  },

  home: {
    name: 'Mi Casa',
    weather: {
      temp: 31,
      feelsLike: 33,
      humidity: 55,
      condition: 'soleado',
      icon: '☀️',
      city: 'Madrid'
    }
  },

  rooms: {
    salon: { name: 'Salón', icon: '🛋️', order: 1 },
    dormitorio: { name: 'Dormitorio', icon: '🛏️', order: 2 },
    cocina: { name: 'Cocina', icon: '🍳', order: 3 },
    bano: { name: 'Baño', icon: '🚿', order: 4 },
    entrada: { name: 'Entrada', icon: '🚪', order: 5 },
    oficina: { name: 'Oficina', icon: '💻', order: 6 }
  },

  devices: {
    // ── Lights (Ledvance Bluetooth) ──
    light_salon_1: {
      id: 'light_salon_1',
      type: 'light',
      name: 'Luz principal',
      room: 'salon',
      brand: 'Ledvance',
      on: true,
      brightness: 80,
      colorTemp: 4000, // Kelvin
      reachable: true
    },
    light_salon_2: {
      id: 'light_salon_2',
      type: 'light',
      name: 'Lámpara pie',
      room: 'salon',
      brand: 'Ledvance',
      on: false,
      brightness: 60,
      colorTemp: 3000,
      reachable: true
    },
    light_dormitorio: {
      id: 'light_dormitorio',
      type: 'light',
      name: 'Luz dormitorio',
      room: 'dormitorio',
      brand: 'Ledvance',
      on: false,
      brightness: 50,
      colorTemp: 2700,
      reachable: true
    },
    light_cocina: {
      id: 'light_cocina',
      type: 'light',
      name: 'Luz cocina',
      room: 'cocina',
      brand: 'Ledvance',
      on: true,
      brightness: 100,
      colorTemp: 5000,
      reachable: true
    },
    light_bano: {
      id: 'light_bano',
      type: 'light',
      name: 'Luz baño',
      room: 'bano',
      brand: 'Ledvance',
      on: false,
      brightness: 100,
      colorTemp: 4000,
      reachable: true
    },
    light_entrada: {
      id: 'light_entrada',
      type: 'light',
      name: 'Luz entrada',
      room: 'entrada',
      brand: 'Ledvance',
      on: true,
      brightness: 40,
      colorTemp: 3000,
      reachable: true
    },
    light_oficina: {
      id: 'light_oficina',
      type: 'light',
      name: 'Luz oficina',
      room: 'oficina',
      brand: 'Ledvance',
      on: false,
      brightness: 90,
      colorTemp: 5000,
      reachable: true
    },

    // ── Air Conditioning (LG) ──
    ac_salon: {
      id: 'ac_salon',
      type: 'ac',
      name: 'Aire salón',
      room: 'salon',
      brand: 'LG ThinQ',
      on: true,
      targetTemp: 23,
      currentTemp: 26,
      mode: 'cool',   // cool, heat, auto, fan, dry
      fanSpeed: 'auto', // low, medium, high, auto
      swing: true,
      reachable: true,
      hasApp: true
    },
    ac_dormitorio: {
      id: 'ac_dormitorio',
      type: 'ac',
      name: 'Aire dormitorio',
      room: 'dormitorio',
      brand: 'LG (antiguo)',
      on: false,
      targetTemp: 22,
      currentTemp: 25,
      mode: 'cool',
      fanSpeed: 'medium',
      swing: false,
      reachable: true,
      hasApp: false
    },

    // ── Thermostat (Meross) ──
    thermostat: {
      id: 'thermostat',
      type: 'thermostat',
      name: 'Termostato',
      room: 'salon',
      brand: 'Meross',
      on: false,
      targetTemp: 21,
      currentTemp: 26,
      mode: 'heat', // heat, eco, off
      schedule: true,
      reachable: true,
      humidity: 55,
      history: [24, 25, 26, 27, 26, 25, 24, 23, 24, 25, 26, 26]
    },

    // ── Camera (Tapo) ──
    camera_entrada: {
      id: 'camera_entrada',
      type: 'camera',
      name: 'Cámara entrada',
      room: 'entrada',
      brand: 'TP-Link Tapo',
      on: true,
      recording: true,
      motionDetected: false,
      lastMotion: '2024-01-15T09:30:00',
      reachable: true
    },

    // ── Alarm (SmartLife / Tuya) ──
    alarm: {
      id: 'alarm',
      type: 'alarm',
      name: 'Alarma',
      room: 'entrada',
      brand: 'Smart Life',
      armed: false,
      mode: 'disarmed', // armed_home, armed_away, disarmed
      triggered: false,
      reachable: true,
      sensors: [
        { name: 'Puerta principal', type: 'door', status: 'closed' },
        { name: 'Ventana salón', type: 'window', status: 'closed' },
        { name: 'Movimiento entrada', type: 'motion', status: 'clear' }
      ]
    },

    // ── Doorbell (Ring) ──
    doorbell: {
      id: 'doorbell',
      type: 'doorbell',
      name: 'Telefonillo Ring',
      room: 'entrada',
      brand: 'Ring',
      on: true,
      battery: 78,
      lastRing: '2024-01-15T08:15:00',
      lastMotion: '2024-01-15T09:45:00',
      reachable: true,
      events: [
        { type: 'ring', time: '08:15', desc: 'Alguien llamó al timbre' },
        { type: 'motion', time: '09:45', desc: 'Movimiento detectado' },
        { type: 'ring', time: '12:30', desc: 'Paquete entregado' }
      ]
    }
  },

  scenes: [
    { id: 'scene_morning', name: 'Buenos días', icon: '🌅', 
      actions: 'Luces 80%, Abrir persianas, Termostato 22°' },
    { id: 'scene_night', name: 'Buenas noches', icon: '🌙', 
      actions: 'Apagar luces, Alarma casa, AC 22°' },
    { id: 'scene_movie', name: 'Cine', icon: '🎬', 
      actions: 'Luces salón 10%, Cerrar persianas' },
    { id: 'scene_away', name: 'Fuera de casa', icon: '🏃', 
      actions: 'Apagar todo, Alarma total, Cámara ON' },
    { id: 'scene_relax', name: 'Relax', icon: '🧘', 
      actions: 'Luces cálidas 40%, AC 24°' },
    { id: 'scene_work', name: 'Trabajo', icon: '💼', 
      actions: 'Oficina 100%, AC 23°' }
  ],

  recentEvents: [
    { type: 'light', icon: '💡', text: 'Luz cocina encendida', time: 'Hace 5 min', color: 'yellow' },
    { type: 'ac', icon: '❄️', text: 'AC salón ajustado a 23°', time: 'Hace 15 min', color: 'blue' },
    { type: 'doorbell', icon: '🔔', text: 'Ring: movimiento detectado', time: 'Hace 30 min', color: 'purple' },
    { type: 'alarm', icon: '🔓', text: 'Alarma desactivada', time: 'Hace 1h', color: 'green' },
    { type: 'camera', icon: '📹', text: 'Cámara: grabación activa', time: 'Hace 2h', color: 'green' }
  ]
};

/* ── Create and export state instance ── */
const state = new ReactiveState(initialState);

// Load any persisted state from localStorage
state.loadPersisted();

export default state;
