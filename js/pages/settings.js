/* ============================================================
   SETTINGS PAGE — SmartHome Dashboard
   App configuration, rooms, profiles, about
   ============================================================ */

import state from '../state.js';
import Icons from '../icons.js';
import StorageService from '../services/storage.js';
import weatherService from '../services/weather-service.js';

export function renderSettings() {
  const user = state.get('user');
  const home = state.get('home');
  const rooms = state.get('rooms');
  const roomCount = Object.keys(rooms).length;
  const devices = state.get('devices');
  const deviceCount = Object.keys(devices).length;

  return `
    <div class="page-grid stagger-children">
      <!-- Header -->
      <div>
        <h2>Configuración</h2>
        <p style="font-size:var(--font-size-sm);">Personaliza tu hogar inteligente</p>
      </div>

      <!-- User Profile -->
      <div class="glass-card" style="text-align:center;">
        <div style="width:72px; height:72px; border-radius:50%; background:var(--gradient-warm); display:flex; align-items:center; justify-content:center; font-size:var(--font-size-2xl); font-weight:var(--font-weight-bold); color:white; margin:0 auto var(--space-md); border:3px solid rgba(255,255,255,0.15);">
          ${user.avatar}
        </div>
        <div style="font-size:var(--font-size-lg); font-weight:var(--font-weight-semibold);">${user.name}</div>
        <div style="font-size:var(--font-size-sm); color:var(--text-secondary); margin-top:2px;">${home.name}</div>
        <div style="display:flex; justify-content:center; gap:var(--space-xl); margin-top:var(--space-lg);">
          <div>
            <div style="font-size:var(--font-size-xl); font-weight:var(--font-weight-bold);">${roomCount}</div>
            <div style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Habitaciones</div>
          </div>
          <div style="width:1px; background:var(--glass-border);"></div>
          <div>
            <div style="font-size:var(--font-size-xl); font-weight:var(--font-weight-bold);">${deviceCount}</div>
            <div style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Dispositivos</div>
          </div>
          <div style="width:1px; background:var(--glass-border);"></div>
          <div>
            <div style="font-size:var(--font-size-xl); font-weight:var(--font-weight-bold);">${user.family.length}</div>
            <div style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Miembros</div>
          </div>
        </div>
      </div>

      <!-- General Settings -->
      <div class="settings-group">
        <div class="settings-group__title">General</div>

        <div class="settings-item">
          <div class="settings-item__left">
            <div class="settings-item__icon">${Icons.home}</div>
            <div>
              <div class="settings-item__label">Nombre del hogar</div>
              <div class="settings-item__desc">Personaliza el nombre de tu casa</div>
            </div>
          </div>
          <div class="settings-item__value">${home.name} ›</div>
        </div>

        <div class="settings-item">
          <div class="settings-item__left">
            <div class="settings-item__icon">${Icons.users}</div>
            <div>
              <div class="settings-item__label">Familia</div>
              <div class="settings-item__desc">${user.family.length} miembros</div>
            </div>
          </div>
          <div class="settings-item__value">${user.family.join(', ')} ›</div>
        </div>

        <div class="settings-item" id="settings-weather-location" style="cursor:pointer;">
          <div class="settings-item__left">
            <div class="settings-item__icon">${Icons.mapPin}</div>
            <div>
              <div class="settings-item__label">Ubicación del Clima</div>
              <div class="settings-item__desc">Datos meteorológicos en vivo (Open-Meteo)</div>
            </div>
          </div>
          <div class="settings-item__value" id="settings-city-value">${home.weather?.city || 'Madrid'} ›</div>
        </div>
      </div>

      <!-- Rooms List -->
      <div class="settings-group">
        <div class="settings-group__title">Habitaciones</div>
        ${Object.entries(rooms).map(([id, room]) => {
          const roomDevices = Object.values(devices).filter(d => d.room === id);
          return `
            <div class="settings-item">
              <div class="settings-item__left">
                <div class="settings-item__icon" style="font-size:1.2rem;">${room.icon}</div>
                <div>
                  <div class="settings-item__label">${room.name}</div>
                  <div class="settings-item__desc">${roomDevices.length} dispositivos</div>
                </div>
              </div>
              <div class="settings-item__value">›</div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Devices -->
      <div class="settings-group">
        <div class="settings-group__title">Dispositivos</div>
        ${Object.values(devices).map(d => `
          <div class="settings-item">
            <div class="settings-item__left">
              <div class="settings-item__icon">
                ${d.type === 'light' ? Icons.lightbulb :
                  d.type === 'ac' ? Icons.snowflake :
                  d.type === 'thermostat' ? Icons.thermometer :
                  d.type === 'camera' ? Icons.camera :
                  d.type === 'alarm' ? Icons.shield :
                  d.type === 'doorbell' ? Icons.bell : Icons.zap}
              </div>
              <div>
                <div class="settings-item__label">${d.name}</div>
                <div class="settings-item__desc">${d.brand} · ${rooms[d.room]?.name || 'General'}</div>
              </div>
            </div>
            <span class="badge ${d.reachable ? 'badge--active' : 'badge--danger'}">
              ${d.reachable ? 'Online' : 'Offline'}
            </span>
          </div>
        `).join('')}
      </div>

      <!-- App Settings -->
      <div class="settings-group">
        <div class="settings-group__title">Aplicación</div>

        <div class="settings-item">
          <div class="settings-item__left">
            <div class="settings-item__icon">${Icons.smartphone}</div>
            <div>
              <div class="settings-item__label">Instalar como app</div>
              <div class="settings-item__desc">Añade al escritorio de tu móvil</div>
            </div>
          </div>
          <button class="btn btn--primary btn--sm" id="pwa-install-btn">Instalar</button>
        </div>

        <div class="settings-item">
          <div class="settings-item__left">
            <div class="settings-item__icon">${Icons.refresh}</div>
            <div>
              <div class="settings-item__label">Restablecer datos</div>
              <div class="settings-item__desc">Vuelve a los datos de simulación</div>
            </div>
          </div>
          <button class="btn btn--danger btn--sm" id="reset-data-btn">Restablecer</button>
        </div>
      </div>

      <!-- About -->
      <div class="glass-card" style="text-align:center;">
        <div style="font-size:var(--font-size-2xl); margin-bottom:var(--space-xs);">🏠</div>
        <div style="font-weight:var(--font-weight-semibold);">SmartHome Dashboard</div>
        <div style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-top:2px;">v1.0.0 · Fase 1 (Simulación)</div>
        <div style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-top:var(--space-xs);">
          Hecho con ❤️ para tu hogar
        </div>
      </div>
    </div>
  `;
}

export function initSettings() {
  // Reset data
  document.getElementById('reset-data-btn')?.addEventListener('click', () => {
    if (confirm('¿Restablecer todos los datos a la simulación original?')) {
      StorageService.clear();
      window.location.reload();
    }
  });

  // PWA install
  document.getElementById('pwa-install-btn')?.addEventListener('click', () => {
    if (window._deferredInstallPrompt) {
      window._deferredInstallPrompt.prompt();
    } else {
      alert('Para instalar: en tu navegador móvil, usa "Añadir a pantalla de inicio" en el menú.');
    }
  });

  // Weather location change
  document.getElementById('settings-weather-location')?.addEventListener('click', async () => {
    const current = state.get('home.weather.city') || 'Madrid';
    const chosen = prompt('Escribe tu ciudad o municipio para el clima:', current);
    if (chosen && chosen.trim() && chosen.trim() !== current) {
      try {
        const w = await weatherService.fetchCurrentWeather(chosen.trim());
        const valEl = document.getElementById('settings-city-value');
        if (valEl) valEl.textContent = `${w.city} ›`;
        alert(`¡Ubicación configurada en ${w.city}! Temperatura actual: ${w.temp}°C (${w.condition})`);
      } catch (err) {
        alert(`No se pudo encontrar la ciudad "${chosen}". Revisa que esté bien escrita.`);
      }
    }
  });
}
