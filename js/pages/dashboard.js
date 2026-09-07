/* ============================================================
   DASHBOARD PAGE — SmartHome Dashboard
   Main overview: weather, stats, rooms, recent activity
   ============================================================ */

import state from '../state.js';
import DeviceService from '../services/device-service.js';
import Icons from '../icons.js';
import weatherService from '../services/weather-service.js';

export function renderDashboard() {
  const weather = state.get('home.weather');
  const stats = DeviceService.getStats();
  const rooms = DeviceService.getRoomSummaries();
  const scenes = state.get('scenes');
  const events = state.get('recentEvents') || [];
  const userName = state.get('user.name');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  return `
    <div class="page-grid stagger-children">
      <!-- Weather Banner -->
      <div class="glass-card glass-card--flat" id="weather-banner" style="background: linear-gradient(135deg, rgba(255,107,53,0.12), rgba(79,195,247,0.08)); border-color: rgba(255,107,53,0.18);">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:var(--space-md);">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:var(--space-xs); flex-wrap:wrap;">
              <span style="font-size:var(--font-size-sm); color:var(--text-secondary);">${greeting}, ${userName}</span>
              <span class="weather-banner__badge" style="display:inline-flex; align-items:center; gap:5px; font-size:10px; padding:2px 8px; border-radius:var(--radius-full); background:rgba(102,187,106,0.15); color:var(--accent-green); border:1px solid rgba(102,187,106,0.25);">
                <span class="pulse-dot pulse-dot--active" style="width:6px;height:6px;"></span>
                En vivo ${weather.lastUpdated ? '(' + weather.lastUpdated + ')' : ''}
              </span>
            </div>

            <div class="weather-banner__temp" style="font-size:var(--font-size-xl); font-weight:var(--font-weight-bold); margin-top:4px;">
              ${weather.icon} ${weather.temp}° en ${weather.city}
            </div>

            <div class="weather-banner__details" style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-top:4px;">
              Sensación ${weather.feelsLike}° · ${weather.windSpeed ? 'Viento ' + weather.windSpeed + ' km/h · ' : ''}${weather.condition}
            </div>

            <!-- Weather Quick Actions -->
            <div style="display:flex; gap:var(--space-xs); margin-top:var(--space-sm);">
              <button class="btn btn--secondary btn--sm" id="change-city-btn" style="padding:3px 10px; font-size:11px; border-radius:var(--radius-full);" title="Cambiar ciudad para el clima">
                ${Icons.mapPin} Cambiar ciudad
              </button>
              <button class="btn btn--secondary btn--sm" id="refresh-weather-btn" style="padding:3px 10px; font-size:11px; border-radius:var(--radius-full);" title="Actualizar datos de Open-Meteo">
                <span class="weather-refresh-icon" style="display:inline-flex;">${Icons.refresh}</span> Actualizar
              </button>
            </div>
          </div>

          <div class="weather-banner__icon" style="font-size:3.5rem; line-height:1; user-select:none;">${weather.icon}</div>
        </div>
      </div>

      <!-- Quick Stats (3 metric cards: Temp Interior, Luces ON, Dispositivos Activos) -->
      <div class="stats-grid">
        <div class="glass-card glass-card--compact">
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--warm">
              ${Icons.thermometer}
            </div>
            <div>
              <div class="stat-card__value">${stats.currentTemp}°</div>
              <div class="stat-card__label">Interior</div>
            </div>
          </div>
        </div>
        <div class="glass-card glass-card--compact">
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--purple">
              ${Icons.lightbulb}
            </div>
            <div>
              <div class="stat-card__value">${stats.lightsOn}</div>
              <div class="stat-card__label">Luces ON</div>
            </div>
          </div>
        </div>
        <div class="glass-card glass-card--compact">
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--green">
              ${Icons.zap}
            </div>
            <div>
              <div class="stat-card__value">${stats.activeDevices}</div>
              <div class="stat-card__label">Activos</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Scenes -->
      <div>
        <div class="section-header">
          <div>
            <div class="section-header__title">Escenas rápidas</div>
          </div>
        </div>
        <div class="scenes-row">
          ${scenes.map(s => `
            <div class="glass-card glass-card--compact scene-card ripple" data-scene="${s.id}" title="${s.actions}">
              <div class="scene-card__icon">${s.icon}</div>
              <div class="scene-card__name">${s.name}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Rooms -->
      <div>
        <div class="section-header">
          <div>
            <div class="section-header__title">Habitaciones</div>
            <div class="section-header__subtitle">${rooms.length} habitaciones configuradas</div>
          </div>
        </div>
        <div class="rooms-grid">
          ${rooms.filter(r => r.totalCount > 0).map(r => `
            <div class="glass-card room-card ripple" data-room="${r.id}">
              <div class="room-card__header">
                <div>
                  <span style="margin-right:6px;">${r.icon}</span>
                  <span class="room-card__name">${r.name}</span>
                </div>
                <span class="room-card__count">${r.activeCount}/${r.totalCount} activos</span>
              </div>
              <div class="room-card__devices">
                ${r.devices.map(d => `
                  <span class="room-card__device-chip ${d.on || d.armed ? 'room-card__device-chip--on' : ''}">
                    <span class="pulse-dot pulse-dot--${d.on || d.armed ? 'active' : 'inactive'}" style="width:6px;height:6px;"></span>
                    ${d.name}
                  </span>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Recent Activity -->
      <div>
        <div class="section-header">
          <div>
            <div class="section-header__title">Actividad reciente</div>
          </div>
        </div>
        <div class="event-log">
          ${events.slice(0, 5).map(e => `
            <div class="event-log__item">
              <div class="event-log__icon" style="background: var(--accent-${e.color}-glow); font-size: 1.2rem;">
                ${e.icon}
              </div>
              <div class="event-log__text">
                <div class="event-log__title">${e.text}</div>
                <div class="event-log__time">${e.time}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

export function initDashboard() {
  // Scene click handlers
  document.querySelectorAll('[data-scene]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.scene;
      el.classList.add('scale-pop');
      showToast(`Escena activada ✨`);
      setTimeout(() => el.classList.remove('scale-pop'), 300);
    });
  });

  // Weather refresh handler
  const refreshBtn = document.getElementById('refresh-weather-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('.weather-refresh-icon');
      if (icon) icon.classList.add('spin-slow');
      showToast('Consultando satélite meteorológico...');
      try {
        const w = await weatherService.fetchCurrentWeather();
        showToast(`Clima en ${w.city}: ${w.temp}° (${w.condition}) 🌤️`);
      } catch (err) {
        showToast('No se pudo conectar con el servicio meteorológico');
      } finally {
        if (icon) icon.classList.remove('spin-slow');
      }
    });
  }

  // Change city handler
  const changeCityBtn = document.getElementById('change-city-btn');
  if (changeCityBtn) {
    changeCityBtn.addEventListener('click', async () => {
      const currentCity = state.get('home.weather.city') || 'Madrid';
      const newCity = prompt('Introduce tu ciudad o municipio:', currentCity);
      if (newCity && newCity.trim() && newCity.trim() !== currentCity) {
        showToast(`Localizando ${newCity}...`);
        try {
          const w = await weatherService.fetchCurrentWeather(newCity.trim());
          showToast(`Clima configurado en ${w.city} (${w.temp}°) ✨`);
        } catch (err) {
          alert(`No se encontró la ciudad "${newCity}". Inténtalo con una ciudad o provincia cercana.`);
        }
      }
    });
  }
}

function showToast(message) {
  const container = document.querySelector('.toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast--success';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast--exit');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
