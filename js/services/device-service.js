/* ============================================================
   DEVICE SERVICE — SmartHome Dashboard
   Abstraction layer for device operations
   Simulated in Phase 1, will be replaced with real API calls
   ============================================================ */

import state from '../state.js';

const DeviceService = {
  /* Get all devices */
  getAll() {
    return state.get('devices');
  },

  /* Get devices by type */
  getByType(type) {
    const devices = this.getAll();
    return Object.values(devices).filter(d => d.type === type);
  },

  /* Get devices by room */
  getByRoom(roomId) {
    const devices = this.getAll();
    return Object.values(devices).filter(d => d.room === roomId);
  },

  /* Get single device */
  get(id) {
    return state.get(`devices.${id}`);
  },

  /* Toggle device on/off */
  toggle(id) {
    const device = this.get(id);
    if (!device) return;
    const newState = !device.on;
    state.set(`devices.${id}.on`, newState);
    this._addEvent(device, newState ? 'encendido' : 'apagado');
    return newState;
  },

  /* Set device property */
  setProperty(id, prop, value) {
    state.set(`devices.${id}.${prop}`, value);
  },

  /* Set AC temperature */
  setACTemp(id, temp) {
    temp = Math.max(16, Math.min(30, temp));
    state.set(`devices.${id}.targetTemp`, temp);
  },

  /* Set AC mode */
  setACMode(id, mode) {
    state.set(`devices.${id}.mode`, mode);
  },

  /* Set light brightness */
  setBrightness(id, brightness) {
    brightness = Math.max(0, Math.min(100, brightness));
    state.set(`devices.${id}.brightness`, brightness);
    if (brightness === 0) {
      state.set(`devices.${id}.on`, false);
    } else if (!this.get(id).on) {
      state.set(`devices.${id}.on`, true);
    }
  },

  /* Set light color temperature */
  setColorTemp(id, kelvin) {
    kelvin = Math.max(2700, Math.min(6500, kelvin));
    state.set(`devices.${id}.colorTemp`, kelvin);
  },

  /* Set thermostat */
  setThermostatTemp(id, temp) {
    temp = Math.max(5.0, Math.min(35.0, Math.round(Number(temp) * 10) / 10));
    state.set(`devices.${id}.targetTemp`, temp);
  },

  /* Alarm control */
  setAlarmMode(id, mode) {
    state.set(`devices.${id}.mode`, mode);
    state.set(`devices.${id}.armed`, mode !== 'disarmed');
    this._addEvent({ name: 'Alarma' },
      mode === 'disarmed' ? 'desactivada' :
      mode === 'armed_home' ? 'activada (casa)' : 'activada (fuera)');
  },

  /* Get summary stats */
  getStats() {
    const devices = Object.values(this.getAll());
    const lights = devices.filter(d => d.type === 'light');
    const lightsOn = lights.filter(d => d.on).length;
    const acs = devices.filter(d => d.type === 'ac');
    const acsOn = acs.filter(d => d.on).length;
    const thermostat = devices.find(d => d.type === 'thermostat');
    const alarm = devices.find(d => d.type === 'alarm');

    return {
      totalDevices: devices.length,
      activeDevices: devices.filter(d => d.on || d.armed).length,
      lightsOn,
      lightsTotal: lights.length,
      acsOn,
      currentTemp: typeof thermostat?.currentTemp === 'number' ? thermostat.currentTemp.toFixed(1) : (thermostat?.currentTemp || '--'),
      humidity: thermostat?.humidity || '--',
      alarmStatus: alarm?.mode || 'unknown'
    };
  },

  /* Get rooms with device counts */
  getRoomSummaries() {
    const rooms = state.get('rooms');
    const devices = Object.values(this.getAll());

    return Object.entries(rooms).map(([id, room]) => {
      const roomDevices = devices.filter(d => d.room === id);
      const activeDevices = roomDevices.filter(d => d.on || d.armed);
      return {
        id,
        ...room,
        devices: roomDevices,
        activeCount: activeDevices.length,
        totalCount: roomDevices.length
      };
    }).sort((a, b) => a.order - b.order);
  },

  /* Add event to recent events */
  _addEvent(device, action) {
    const typeIcons = {
      light: '💡', ac: '❄️', thermostat: '🌡️',
      camera: '📹', alarm: '🔒', doorbell: '🔔'
    };
    const typeColors = {
      light: 'yellow', ac: 'blue', thermostat: 'orange',
      camera: 'green', alarm: 'green', doorbell: 'purple'
    };

    const events = state.get('recentEvents') || [];
    events.unshift({
      type: device.type || 'system',
      icon: typeIcons[device.type] || '⚡',
      text: `${device.name} ${action}`,
      time: 'Ahora',
      color: typeColors[device.type] || 'orange'
    });

    // Keep only last 20 events
    state.set('recentEvents', events.slice(0, 20));
  }
};

export default DeviceService;
