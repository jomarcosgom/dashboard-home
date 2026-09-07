/* ============================================================
   LIGHTS PAGE — SmartHome Dashboard
   Light controls: toggle, brightness, color temperature
   ============================================================ */

import state from '../state.js';
import DeviceService from '../services/device-service.js';
import Icons from '../icons.js';

export function renderLights() {
  const lights = DeviceService.getByType('light');
  const rooms = state.get('rooms');
  const lightsOn = lights.filter(l => l.on).length;

  // Group lights by room
  const grouped = {};
  lights.forEach(l => {
    if (!grouped[l.room]) grouped[l.room] = [];
    grouped[l.room].push(l);
  });

  const scenes = [
    { id: 'bright', name: 'Día', icon: '☀️', desc: 'Todo al 100%' },
    { id: 'relax', name: 'Relax', icon: '🕯️', desc: 'Cálido 40%' },
    { id: 'movie', name: 'Cine', icon: '🎬', desc: 'Salón 10%' },
    { id: 'night', name: 'Noche', icon: '🌙', desc: 'Todo apagado' }
  ];

  return `
    <div class="page-grid stagger-children">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div>
          <h2>Luces</h2>
          <p style="font-size:var(--font-size-sm);">${lightsOn} de ${lights.length} encendidas</p>
        </div>
        <button class="btn btn--primary btn--sm" id="lights-toggle-all">
          ${Icons.power} ${lightsOn > 0 ? 'Apagar todo' : 'Encender todo'}
        </button>
      </div>

      <!-- Light Scenes -->
      <div class="scenes-row">
        ${scenes.map(s => `
          <div class="glass-card glass-card--compact scene-card ripple" data-light-scene="${s.id}">
            <div class="scene-card__icon">${s.icon}</div>
            <div class="scene-card__name">${s.name}</div>
          </div>
        `).join('')}
      </div>

      <!-- Lights by Room -->
      ${Object.entries(grouped).map(([roomId, roomLights]) => `
        <div>
          <div class="section-header">
            <div class="section-header__title">${rooms[roomId]?.icon || ''} ${rooms[roomId]?.name || roomId}</div>
          </div>
          <div class="devices-grid">
            ${roomLights.map(light => `
              <div class="glass-card glass-card--compact" id="light-card-${light.id}" style="${light.on ? 'border-color: rgba(255,213,79,0.3); background: rgba(255,213,79,0.06);' : ''}">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-md);">
                  <div class="device-icon device-icon--light ${light.on ? 'device-icon--active light-glow light-glow--on' : ''}" style="${light.on ? 'background: var(--accent-yellow-glow);' : ''}">
                    ${Icons.lightbulb}
                  </div>
                  <label class="toggle">
                    <input type="checkbox" ${light.on ? 'checked' : ''} data-light-toggle="${light.id}">
                    <span class="toggle__track"></span>
                  </label>
                </div>
                <div style="font-weight:var(--font-weight-medium); font-size:var(--font-size-sm); margin-bottom:2px;">${light.name}</div>
                <div style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-bottom:var(--space-md);">
                  ${light.on ? `${light.brightness}% · ${light.colorTemp}K` : 'Apagada'}
                </div>
                ${light.on ? `
                  <div style="margin-bottom:var(--space-sm);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                      <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Brillo</span>
                      <span style="font-size:var(--font-size-xs); color:var(--accent-yellow);" id="brightness-val-${light.id}">${light.brightness}%</span>
                    </div>
                    <input type="range" class="slider slider--yellow" min="1" max="100" value="${light.brightness}" data-brightness="${light.id}">
                  </div>
                  <div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                      <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">🔥 Cálido</span>
                      <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Frío ❄️</span>
                    </div>
                    <input type="range" class="slider slider--blue" min="2700" max="6500" value="${light.colorTemp}" data-colortemp="${light.id}">
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function initLights() {
  // Toggle individual lights
  document.querySelectorAll('[data-light-toggle]').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = e.target.dataset.lightToggle;
      DeviceService.toggle(id);
      refreshLightsPage();
    });
  });

  // Brightness sliders
  document.querySelectorAll('[data-brightness]').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const id = e.target.dataset.brightness;
      const val = parseInt(e.target.value);
      DeviceService.setBrightness(id, val);
      const label = document.getElementById(`brightness-val-${id}`);
      if (label) label.textContent = `${val}%`;
    });
  });

  // Color temperature sliders
  document.querySelectorAll('[data-colortemp]').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const id = e.target.dataset.colortemp;
      DeviceService.setColorTemp(id, parseInt(e.target.value));
    });
  });

  // Toggle all
  document.getElementById('lights-toggle-all')?.addEventListener('click', () => {
    const lights = DeviceService.getByType('light');
    const anyOn = lights.some(l => l.on);
    lights.forEach(l => {
      if (anyOn && l.on) DeviceService.toggle(l.id);
      if (!anyOn && !l.on) DeviceService.toggle(l.id);
    });
    refreshLightsPage();
  });

  // Light scenes
  document.querySelectorAll('[data-light-scene]').forEach(el => {
    el.addEventListener('click', () => {
      const scene = el.dataset.lightScene;
      const lights = DeviceService.getByType('light');
      lights.forEach(l => {
        switch(scene) {
          case 'bright':
            if (!l.on) DeviceService.toggle(l.id);
            DeviceService.setBrightness(l.id, 100);
            DeviceService.setColorTemp(l.id, 5000);
            break;
          case 'relax':
            if (!l.on) DeviceService.toggle(l.id);
            DeviceService.setBrightness(l.id, 40);
            DeviceService.setColorTemp(l.id, 2700);
            break;
          case 'movie':
            if (l.room === 'salon') {
              if (!l.on) DeviceService.toggle(l.id);
              DeviceService.setBrightness(l.id, 10);
              DeviceService.setColorTemp(l.id, 2700);
            } else {
              if (l.on) DeviceService.toggle(l.id);
            }
            break;
          case 'night':
            if (l.on) DeviceService.toggle(l.id);
            break;
        }
      });
      el.classList.add('scale-pop');
      setTimeout(() => el.classList.remove('scale-pop'), 300);
      refreshLightsPage();
    });
  });
}

function refreshLightsPage() {
  const container = document.getElementById('page-content');
  if (container) {
    const page = container.firstElementChild;
    if (page) {
      page.innerHTML = renderLights();
      initLights();
    }
  }
}
