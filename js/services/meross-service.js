/* ============================================================
   MEROSS SERVICE — SmartHome Dashboard Frontend
   Communicates with the Node.js backend to control Meross devices
   ============================================================ */

import state from '../state.js';

class MerossService {
  constructor() {
    this.status = {
      connected: false,
      hasSession: false,
      devicesCount: 0,
      thermostat: null
    };
    this.pollInterval = 10000; // 10s polling when connected
    this.timer = null;
  }

  /* ── Check backend Meross status ── */
  async checkStatus() {
    try {
      const res = await fetch('/api/meross/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.status = data;

      if (data.connected && data.thermostat) {
        // Sync with app state
        const currentThermo = state.get('devices.thermostat') || {};
        state.set('devices.thermostat', {
          ...currentThermo,
          name: data.thermostat.devName || 'Termostato Meross',
          currentTemp: data.thermostat.currentTemp ?? currentThermo.currentTemp,
          targetTemp: data.thermostat.targetTemp ?? currentThermo.targetTemp,
          minTemp: data.thermostat.minTemp ?? 5.0,
          maxTemp: data.thermostat.maxTemp ?? 35.0,
          ecoTemp: data.thermostat.ecoTemp ?? 12.0,
          heatTemp: data.thermostat.heatTemp ?? 26.0,
          isHeating: Boolean(data.thermostat.isHeating),
          state: data.thermostat.state ?? 0,
          on: data.thermostat.onoff ?? currentThermo.on,
          mode: data.thermostat.mode || currentThermo.mode,
          modeNum: data.thermostat.modeNum,
          isReal: true,
          lastUpdated: data.thermostat.lastUpdated
        });
      }

      return data;
    } catch (err) {
      console.warn('[MerossService] No se pudo obtener estado de Meross:', err);
      return { connected: false, error: err.message };
    }
  }

  /* ── Authenticate with Meross Cloud ── */
  async login(email, password, mfaCode = null) {
    try {
      const res = await fetch('/api/meross/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, mfaCode })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Fallo de autenticación');
      }

      // Refresh status after successful login
      await this.checkStatus();
      this.startPolling();
      return data;
    } catch (err) {
      console.error('[MerossService] Error en login:', err);
      throw err;
    }
  }

  /* ── Send command to physical thermostat ── */
  async setThermostat(controls) {
    try {
      const res = await fetch('/api/meross/thermostat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(controls)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error enviando orden');

      if (data.thermostat) {
        const current = state.get('devices.thermostat') || {};
        state.set('devices.thermostat', {
          ...current,
          name: data.thermostat.devName || current.name,
          currentTemp: data.thermostat.currentTemp ?? current.currentTemp,
          targetTemp: data.thermostat.targetTemp ?? current.targetTemp,
          minTemp: data.thermostat.minTemp ?? current.minTemp ?? 5.0,
          maxTemp: data.thermostat.maxTemp ?? current.maxTemp ?? 35.0,
          ecoTemp: data.thermostat.ecoTemp ?? current.ecoTemp ?? 12.0,
          heatTemp: data.thermostat.heatTemp ?? current.heatTemp ?? 26.0,
          isHeating: Boolean(data.thermostat.isHeating),
          state: data.thermostat.state ?? current.state,
          on: data.thermostat.onoff ?? current.on,
          mode: data.thermostat.mode || current.mode,
          modeNum: data.thermostat.modeNum,
          lastUpdated: data.thermostat.lastUpdated
        });
      }

      return data;
    } catch (err) {
      console.error('[MerossService] Error controlando termostato:', err);
      throw err;
    }
  }

  /* ── Logout from Meross ── */
  async logout() {
    try {
      await fetch('/api/meross/logout', { method: 'POST' });
      this.status.connected = false;
      this.stopPolling();
      const current = state.get('devices.thermostat') || {};
      state.set('devices.thermostat', {
        ...current,
        isReal: false
      });
      return { success: true };
    } catch (err) {
      console.error('[MerossService] Error cerrando sesión:', err);
      throw err;
    }
  }

  /* ── Background polling for real-time telemetry ── */
  startPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.checkStatus().catch(() => {});
    }, this.pollInterval);
  }

  stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

const merossService = new MerossService();
export default merossService;
