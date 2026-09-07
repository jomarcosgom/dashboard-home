/* ============================================================
   ALARM SERVICE — SmartHome Dashboard
   Handles real-time communication with backend Alarm API
   ============================================================ */

import state from '../state.js';

class AlarmService {
  constructor() {
    this._pollingTimer = null;
    this._listeners = new Set();
    this._isPolling = false;
  }

  /* Fetch alarm status from server */
  async getStatus() {
    try {
      const res = await fetch('/api/alarm/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.alarm) {
        this._updateState(data.alarm);
        return data.alarm;
      }
    } catch (err) {
      console.warn('[AlarmService] Error fetching status:', err.message);
    }
    return state.get('devices.alarm');
  }

  _formatError(err) {
    if (!err) return 'Error desconocido';
    const msg = err.message || String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
      return 'No se puede conectar con el servidor local (server.js). Asegúrate de iniciarlo ejecutando "npm start" o "node server.js" en la terminal (puerto 8080).';
    }
    return msg;
  }

  /* Arm or disarm the alarm with optional PIN */
  async setMode(mode, pin = null) {
    try {
      const res = await fetch('/api/alarm/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, pin })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al cambiar modo de alarma');
      }
      this._updateState(data.alarm);
      return { success: true, message: data.message, alarm: data.alarm };
    } catch (err) {
      return { success: false, error: this._formatError(err) };
    }
  }

  /* Trigger panic SOS alarm */
  async triggerSOS() {
    try {
      const res = await fetch('/api/alarm/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success && data.alarm) {
        this._updateState(data.alarm);
        return { success: true, alarm: data.alarm };
      }
      throw new Error(data.error || 'Error activando SOS');
    } catch (err) {
      return { success: false, error: this._formatError(err) };
    }
  }

  /* Toggle sensor state (open/close door, window, motion) */
  async toggleSensor(sensorId) {
    try {
      const res = await fetch('/api/alarm/sensor/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensorId })
      });
      const data = await res.json();
      if (data.success && data.alarm) {
        this._updateState(data.alarm);
        return { success: true, sensor: data.sensor, alarm: data.alarm };
      }
    } catch (err) {
      console.warn('[AlarmService] Error toggling sensor:', this._formatError(err));
    }
    return { success: false };
  }

  /* Login to real Smart Life / Tuya account */
  async login(credentials) {
    try {
      const res = await fetch('/api/alarm/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al conectar con Smart Life');
      }
      if (data.alarm) {
        this._updateState(data.alarm);
      }
      return { success: true, message: data.message, devicesCount: data.devicesCount, alarm: data.alarm };
    } catch (err) {
      return { success: false, error: this._formatError(err) };
    }
  }

  /* Login via Tuya IoT Platform (iot.tuya.com) — Client ID + Secret */
  async iotLogin(credentials) {
    try {
      const res = await fetch('/api/alarm/iot-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al conectar con Tuya IoT Platform');
      }
      if (data.alarm) {
        this._updateState(data.alarm);
      }
      return { success: true, message: data.message, devicesCount: data.devicesCount, uid: data.uid, needsUid: data.needsUid, alarm: data.alarm };
    } catch (err) {
      return { success: false, error: this._formatError(err) };
    }
  }

  /* Sync/refresh devices from Smart Life cloud */
  async refresh() {
    try {
      const res = await fetch('/api/alarm/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success && data.alarm) {
        this._updateState(data.alarm);
        return { success: true, message: data.message, alarm: data.alarm };
      }
      throw new Error(data.error || 'Error al refrescar alarma');
    } catch (err) {
      return { success: false, error: this._formatError(err) };
    }
  }

  /* Unlink Smart Life account */
  async logout() {
    try {
      const res = await fetch('/api/alarm/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success && data.alarm) {
        this._updateState(data.alarm);
        return { success: true, message: data.message };
      }
      throw new Error(data.error || 'Error al desvincular cuenta');
    } catch (err) {
      return { success: false, error: this._formatError(err) };
    }
  }

  /* Update alarm config or PIN */
  async updateConfig(options) {
    try {
      const res = await fetch('/api/alarm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });
      const data = await res.json();
      if (data.success && data.alarm) {
        this._updateState(data.alarm);
        return { success: true, message: data.message };
      }
      throw new Error(data.error || 'Error guardando ajustes');
    } catch (err) {
      return { success: false, error: this._formatError(err) };
    }
  }

  /* Save / customize sensors list and RF zones */
  async saveSensors(sensors) {
    try {
      const res = await fetch('/api/alarm/sensors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensors })
      });
      const data = await res.json();
      if (data.success && data.alarm) {
        this._updateState(data.alarm);
        return { success: true, message: data.message, sensors: data.sensors, alarm: data.alarm };
      }
      throw new Error(data.error || 'Error guardando zonas de sensores');
    } catch (err) {
      return { success: false, error: this._formatError(err) };
    }
  }

  /* Start periodic background polling */
  startPolling(intervalMs = 4000) {
    if (this._pollingTimer) return;
    this._isPolling = true;
    this.getStatus(); // immediate first fetch
    this._pollingTimer = setInterval(() => {
      if (this._isPolling) {
        this.getStatus();
      }
    }, intervalMs);
  }

  /* Stop polling */
  stopPolling() {
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
    this._isPolling = false;
  }

  /* Internal state sync */
  _updateState(alarmData) {
    const current = state.get('devices.alarm') || {};
    const updated = {
      ...current,
      ...alarmData,
      armed: alarmData.mode !== 'disarmed',
      reachable: true
    };
    state.set('devices.alarm', updated);

    // Notify listeners
    this._listeners.forEach(cb => {
      try { cb(updated); } catch (e) {}
    });
  }

  /* Subscribe to alarm updates */
  onChange(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }
}

const alarmService = new AlarmService();
export default alarmService;
