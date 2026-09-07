/* ============================================================
   CLIMATE PAGE — SmartHome Dashboard
   AC controls, thermostat with high-precision control, presets & modes
   ============================================================ */

import state from '../state.js';
import DeviceService from '../services/device-service.js';
import Icons from '../icons.js';
import merossService from '../services/meross-service.js';

let debounceTimer = null;

export function renderClimate() {
  const acs = DeviceService.getByType('ac');
  const thermostat = DeviceService.get('thermostat') || {};
  const history = thermostat.history || [];

  const currentTempNum = typeof thermostat.currentTemp === 'number' ? thermostat.currentTemp : 21.0;
  const targetTempNum = typeof thermostat.targetTemp === 'number' ? thermostat.targetTemp : 21.0;
  const minTemp = thermostat.minTemp ?? 5.0;
  const maxTemp = thermostat.maxTemp ?? 35.0;
  const isHeating = Boolean(thermostat.isHeating);
  const mode = thermostat.mode || 'heat';

  // Calculate SVG gauge offset based on 5.0 - 35.0°C range (span = 30°C)
  const radius = 85;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, (targetTempNum - 5.0) / 30.0));
  const dashoffset = circumference * (1 - pct);

  const presets = [
    { label: '❄️ 5.5° Mínimo', temp: 5.5, title: 'Modo anti-congelación / mínimo' },
    { label: '🌿 17.0° Eco', temp: 17.0, title: 'Temperatura económica' },
    { label: '🛋️ 20.0° Confort', temp: 20.0, title: 'Confort diurno estándar' },
    { label: '🔥 22.5° Calor', temp: 22.5, title: 'Calor acogedor' }
  ];

  return `
    <div class="page-grid stagger-children">
      <!-- Header -->
      <div>
        <h2>Climatización</h2>
        <p style="font-size:var(--font-size-sm);">Control de precisión de temperatura y aire acondicionado</p>
      </div>

      <!-- Thermostat Card -->
      <div class="glass-card" style="text-align:center; ${thermostat.on ? 'border-color: rgba(255,107,53,0.28); background: rgba(255,107,53,0.03);' : ''}">
        <!-- Top Device Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-md); flex-wrap:wrap; gap:var(--space-xs);">
          <div style="text-align:left;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-weight:var(--font-weight-semibold); font-size:var(--font-size-base);">🌡️ ${thermostat.name || 'Termostato Meross'}</span>
              ${merossService.status.connected ? `
                <span class="badge badge--success" style="font-size:10px; padding:2px 8px; border-radius:var(--radius-full); display:inline-flex; align-items:center; gap:4px;">
                  <span class="pulse-dot pulse-dot--active" style="width:5px;height:5px;"></span> En Vivo (MTS200)
                </span>
              ` : ''}
              ${thermostat.on ? (isHeating ? `
                <span class="badge" style="background:rgba(255,107,53,0.22); color:var(--accent-orange); border:1px solid rgba(255,107,53,0.4); font-size:10px;">
                  <span class="flame-pulse">🔥</span> Calentando
                </span>
              ` : `
                <span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-tertiary); font-size:10px;">
                  ⚪ Reposo
                </span>
              `) : ''}
            </div>
            <div style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-top:3px;">
              ${thermostat.on ? `
                Modo <strong>${mode === 'auto' ? 'Programado (Horario)' : (mode === 'eco' ? 'Eco' : 'Manual')}</strong> · 
                Consigna: <strong>${targetTempNum.toFixed(1)}°C</strong> · 
                Ambiente: <strong>${currentTempNum.toFixed(1)}°C</strong>
              ` : 'Termostato apagado'}
              ${thermostat.lastUpdated ? ` · Act: ${thermostat.lastUpdated}` : ''}
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:var(--space-sm);">
            ${!merossService.status.connected ? `
              <button class="btn btn--sm" id="btn-open-meross-modal" style="font-size:11px; padding:3px 10px; border-radius:var(--radius-full); background:rgba(255,107,53,0.15); border:1px solid rgba(255,107,53,0.3); color:var(--accent-orange); font-weight:var(--font-weight-medium);">
                🔗 Conectar Meross Real
              </button>
            ` : `
              <button class="btn btn--secondary btn--sm" id="btn-meross-logout" style="font-size:10px; padding:2px 8px; border-radius:var(--radius-full);" title="Cerrar sesión de Meross">
                Desconectar
              </button>
            `}
            <label class="toggle" title="${thermostat.on ? 'Apagar termostato' : 'Encender termostato'}">
              <input type="checkbox" ${thermostat.on ? 'checked' : ''} id="thermostat-toggle">
              <span class="toggle__track"></span>
            </label>
          </div>
        </div>
        
        <!-- Circular Gauge (Scale 5°C - 35°C) -->
        <div class="circular-gauge" style="width:220px; height:220px; margin: 0 auto var(--space-md);">
          <svg class="circular-gauge__svg" width="220" height="220" viewBox="0 0 220 220">
            <circle class="circular-gauge__bg" cx="110" cy="110" r="85" stroke-width="10"/>
            <circle class="circular-gauge__fill" id="gauge-circle-fill" cx="110" cy="110" r="85" stroke-width="10"
              stroke="url(#tempGradient)"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${dashoffset}"
            />
            <defs>
              <linearGradient id="tempGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color: ${thermostat.on ? '#ff6b35' : '#78909c'}"/>
                <stop offset="100%" style="stop-color: ${thermostat.on ? '#f7931e' : '#455a64'}"/>
              </linearGradient>
            </defs>
          </svg>
          <div class="circular-gauge__value">
            <div class="circular-gauge__number ${thermostat.on && isHeating ? 'temp-pulse' : ''}" id="gauge-temp-display" style="font-size: 2.8rem; font-weight: 800; color: ${thermostat.on ? 'var(--text-primary)' : 'var(--text-tertiary)'};">
              ${targetTempNum.toFixed(1)}°
            </div>
            <div class="circular-gauge__unit" style="font-size:12px; margin-top:2px;">
              Interior: <strong>${currentTempNum.toFixed(1)}°C</strong>
            </div>
            <div style="font-size:10px; color:var(--text-tertiary); margin-top:4px;">
              ${mode === 'auto' ? '📅 Programado' : (mode === 'eco' ? '🌿 Modo Eco' : '🔥 Manual')}
            </div>
          </div>
        </div>

        ${thermostat.on ? `
          <!-- Target Stepper (-0.5° / +0.5°) -->
          <div style="display:flex; align-items:center; justify-content:center; gap:var(--space-md); margin-bottom:var(--space-sm);">
            <button class="btn btn--icon" id="thermo-minus" title="Bajar 0.5°C" style="font-weight:700; font-size:15px;">
              -0.5°
            </button>
            <div style="min-width: 140px;">
              <div style="font-size:var(--font-size-3xl); font-weight:var(--font-weight-bold); line-height:1; color:var(--accent-orange);" id="thermo-target-readout">
                ${targetTempNum.toFixed(1)}°C
              </div>
              <div style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-top:3px;">
                Consigna fijada
              </div>
            </div>
            <button class="btn btn--icon" id="thermo-plus" title="Subir 0.5°C" style="font-weight:700; font-size:15px;">
              +0.5°
            </button>
          </div>

          <!-- Precision Continuous Slider (5.0°C to 35.0°C with 0.5°C steps) -->
          <div style="max-width:340px; margin: 0 auto var(--space-md); padding: 0 var(--space-xs);">
            <input 
              type="range" 
              id="thermo-slider" 
              min="5.0" 
              max="35.0" 
              step="0.5" 
              value="${targetTempNum.toFixed(1)}" 
              class="slider slider--orange" 
              style="width:100%; margin: 8px 0;"
            >
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-tertiary);">
              <span>5.0°C (Mínimo)</span>
              <span style="color:var(--accent-orange); font-weight:var(--font-weight-medium);">Paso de 0.5°C</span>
              <span>35.0°C (Máximo)</span>
            </div>
          </div>

          <!-- Quick Presets -->
          <div style="margin-bottom:var(--space-md);">
            <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em;">
              Atajos Rápidos de Temperatura
            </div>
            <div class="preset-chips-row">
              ${presets.map(p => {
                const isActive = Math.abs(targetTempNum - p.temp) < 0.1;
                return `
                  <button 
                    class="preset-chip ${isActive ? 'preset-chip--active' : ''}" 
                    data-preset-temp="${p.temp}"
                    title="${p.title}"
                  >
                    ${p.label}
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Mode Selector (Manual, Auto / Programado, Eco) -->
          <div style="margin-bottom:var(--space-md);">
            <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em;">
              Modo de Funcionamiento
            </div>
            <div class="mode-selector" style="max-width:360px; margin:0 auto;">
              <div 
                class="mode-selector__option ${mode === 'heat' ? 'mode-selector__option--active mode-selector__option--heat' : ''}" 
                data-thermo-mode="heat"
                title="Modo Manual: tú fijas la temperatura"
              >
                ${Icons.flame} Manual
              </div>
              <div 
                class="mode-selector__option ${mode === 'auto' ? 'mode-selector__option--active mode-selector__option--auto' : ''}" 
                data-thermo-mode="auto"
                title="Modo Programado: sigue el horario de la app Meross"
              >
                📅 Programado
              </div>
              <div 
                class="mode-selector__option ${mode === 'eco' ? 'mode-selector__option--active mode-selector__option--eco' : ''}" 
                data-thermo-mode="eco"
                title="Modo Eco: ahorro de energía"
              >
                🌿 Eco
              </div>
            </div>
          </div>
        ` : `
          <div style="padding:var(--space-lg); color:var(--text-tertiary); font-size:var(--font-size-sm);">
            El termostato está apagado. Activa el interruptor para ajustar temperatura y modos.
          </div>
        `}

        <!-- Hardware Telemetry Info Bar -->
        <div style="display:flex; justify-content:space-around; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:var(--radius-md); padding:8px 12px; margin-top:var(--space-md); font-size:11px; color:var(--text-secondary); flex-wrap:wrap; gap:8px;">
          <div>Sonda real: <strong style="color:var(--text-primary);">${currentTempNum.toFixed(1)}°C</strong></div>
          <div>Calefacción: <strong style="color:${isHeating ? 'var(--accent-orange)' : 'var(--text-primary)'};">${isHeating ? '🔥 Activa' : '⚪ Reposo'}</strong></div>
          <div>Modo Eco: <strong style="color:var(--text-primary);">${(thermostat.ecoTemp ?? 12.0).toFixed(1)}°C</strong></div>
          <div>Hardware: <strong style="color:var(--text-primary);">MTS200 EU</strong></div>
        </div>

        <!-- Mini Temperature History -->
        <div style="margin-top:var(--space-md);">
          <div style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-bottom:var(--space-xs);">Tendencia de temperatura</div>
          <div style="display:flex; align-items:flex-end; gap:4px; height:36px; justify-content:center;">
            ${history.map((temp, i) => {
              const h = ((temp - 15) / 20) * 36;
              const color = temp > 25 ? 'var(--accent-orange)' : 'var(--accent-blue)';
              return `<div style="width:16px; height:${Math.max(4, h)}px; background:${color}; border-radius:3px; opacity:${0.4 + (i / history.length) * 0.6};" title="${temp}°"></div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- AC Units -->
      <div class="section-header">
        <div class="section-header__title">Aires acondicionados</div>
      </div>

      ${acs.map(ac => `
        <div class="glass-card ${ac.on ? 'glow-breathe--blue' : ''}" id="ac-card-${ac.id}" style="${ac.on ? 'border-color: rgba(79,195,247,0.25); background: rgba(79,195,247,0.04);' : ''}">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-md);">
            <div style="display:flex; align-items:center; gap:var(--space-sm);">
              <div class="device-icon device-icon--cool ${ac.on ? 'device-icon--active wind-effect wind-effect--active' : 'wind-effect'}">
                ${Icons.snowflake}
              </div>
              <div>
                <div style="font-weight:var(--font-weight-semibold);">${ac.name}</div>
                <div style="font-size:var(--font-size-xs); color:var(--text-tertiary);">
                  ${ac.brand} ${!ac.hasApp ? '· Sin app' : ''}
                </div>
              </div>
            </div>
            <label class="toggle toggle--blue">
              <input type="checkbox" ${ac.on ? 'checked' : ''} data-ac-toggle="${ac.id}">
              <span class="toggle__track"></span>
            </label>
          </div>

          ${ac.on ? `
            <!-- Temperature -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-md); padding: var(--space-sm) var(--space-md); background: rgba(79,195,247,0.06); border-radius: var(--radius-lg);">
              <div>
                <div style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Actual</div>
                <div style="font-size:var(--font-size-xl); font-weight:var(--font-weight-bold);">${ac.currentTemp}°</div>
              </div>
              <div style="display:flex; align-items:center; gap:var(--space-sm);">
                <button class="btn btn--icon btn--sm" data-ac-temp-minus="${ac.id}">${Icons.minus}</button>
                <div style="text-align:center;">
                  <div style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Objetivo</div>
                  <div style="font-size:var(--font-size-xl); font-weight:var(--font-weight-bold); color:var(--accent-blue);" id="ac-target-${ac.id}">${ac.targetTemp}°</div>
                </div>
                <button class="btn btn--icon btn--sm" data-ac-temp-plus="${ac.id}">${Icons.plus}</button>
              </div>
            </div>

            <!-- Mode -->
            <div class="mode-selector" style="margin-bottom:var(--space-md);">
              <div class="mode-selector__option ${ac.mode === 'cool' ? 'mode-selector__option--active mode-selector__option--cool' : ''}" data-ac-mode="${ac.id}" data-mode="cool">
                ${Icons.snowflake} Frío
              </div>
              <div class="mode-selector__option ${ac.mode === 'heat' ? 'mode-selector__option--active mode-selector__option--heat' : ''}" data-ac-mode="${ac.id}" data-mode="heat">
                ${Icons.flame} Calor
              </div>
              <div class="mode-selector__option ${ac.mode === 'auto' ? 'mode-selector__option--active mode-selector__option--auto' : ''}" data-ac-mode="${ac.id}" data-mode="auto">
                ${Icons.auto} Auto
              </div>
              <div class="mode-selector__option ${ac.mode === 'fan' ? 'mode-selector__option--active' : ''}" data-ac-mode="${ac.id}" data-mode="fan">
                ${Icons.wind} Fan
              </div>
            </div>

            <!-- Fan Speed -->
            <div>
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Velocidad ventilador</span>
                <span style="font-size:var(--font-size-xs); color:var(--accent-blue);">${ac.fanSpeed}</span>
              </div>
              <div style="display:flex; gap:var(--space-xs);">
                ${['low', 'medium', 'high', 'auto'].map(speed => `
                  <button class="btn btn--sm ${ac.fanSpeed === speed ? 'btn--primary' : 'btn--secondary'}" 
                    data-ac-fan="${ac.id}" data-speed="${speed}" style="${ac.fanSpeed === speed ? 'background: var(--gradient-cool);' : ''}">
                    ${speed === 'auto' ? 'Auto' : speed === 'low' ? 'Baja' : speed === 'medium' ? 'Media' : 'Alta'}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : `
            <div style="font-size:var(--font-size-sm); color:var(--text-tertiary); text-align:center; padding:var(--space-md);">
              Aire acondicionado apagado
            </div>
          `}
        </div>
      `).join('')}
    </div>
  `;
}

/* ── DOM Update helper for instant 60fps feedback ── */
function updateThermostatLiveDisplay(temp) {
  const rounded = Math.round(Number(temp) * 10) / 10;
  const formatted = rounded.toFixed(1);

  // Update target labels
  const readout = document.getElementById('thermo-target-readout');
  if (readout) readout.textContent = `${formatted}°C`;

  const gaugeDisplay = document.getElementById('gauge-temp-display');
  if (gaugeDisplay) gaugeDisplay.textContent = `${formatted}°`;

  // Update slider if not matching
  const slider = document.getElementById('thermo-slider');
  if (slider && Math.abs(parseFloat(slider.value) - rounded) > 0.05) {
    slider.value = formatted;
  }

  // Update SVG stroke
  const circle = document.getElementById('gauge-circle-fill');
  if (circle) {
    const radius = 85;
    const circumference = 2 * Math.PI * radius;
    const pct = Math.max(0, Math.min(1, (rounded - 5.0) / 30.0));
    circle.style.strokeDashoffset = `${circumference * (1 - pct)}`;
  }

  // Update preset chip highlights
  document.querySelectorAll('[data-preset-temp]').forEach(chip => {
    const pTemp = parseFloat(chip.dataset.presetTemp);
    if (Math.abs(pTemp - rounded) < 0.1) {
      chip.classList.add('preset-chip--active');
    } else {
      chip.classList.remove('preset-chip--active');
    }
  });
}

/* ── Debounced Thermostat Network Dispatcher ── */
function sendDebouncedThermostatUpdate(controls) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (merossService.status.connected) {
      try {
        const res = await merossService.setThermostat(controls);
        if (res && res.success) {
          const tempMsg = controls.targetTemp !== undefined ? `${Number(controls.targetTemp).toFixed(1)}°C` : '';
          showToast(`Termostato actualizado: ${tempMsg || controls.mode || 'OK'}`);
        }
      } catch (err) {
        showToast('Error sincronizando con el termostato Meross');
      }
    }
  }, 350);
}

export function initClimate() {
  // Check live status on load
  merossService.checkStatus().then(data => {
    if (data && data.connected && data.thermostat) {
      const currentThermo = DeviceService.get('thermostat');
      if (currentThermo) {
        updateThermostatLiveDisplay(data.thermostat.targetTemp ?? currentThermo.targetTemp);
      }
    }
  });

  // Connect Meross modal opener
  document.getElementById('btn-open-meross-modal')?.addEventListener('click', () => {
    openMerossModal();
  });

  // Logout Meross
  document.getElementById('btn-meross-logout')?.addEventListener('click', async () => {
    if (confirm('¿Desconectar tu cuenta de Meross Cloud?')) {
      await merossService.logout();
      showToast('Desconectado de Meross');
      refreshClimatePage();
    }
  });

  // Thermostat Power Toggle
  document.getElementById('thermostat-toggle')?.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    DeviceService.toggle('thermostat');
    if (merossService.status.connected) {
      try {
        await merossService.setThermostat({ onoff: isChecked });
        showToast(isChecked ? 'Termostato encendido 🔥' : 'Termostato apagado ❄️');
      } catch (err) {
        showToast('Error enviando orden a Meross');
      }
    }
    refreshClimatePage();
  });

  // Thermostat Slider (Continuous control 5.0 - 35.0°C)
  const slider = document.getElementById('thermo-slider');
  if (slider) {
    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      updateThermostatLiveDisplay(val);
      DeviceService.setThermostatTemp('thermostat', val);
      DeviceService.setProperty('thermostat', 'mode', 'heat');
      sendDebouncedThermostatUpdate({ targetTemp: val, mode: 'heat' });
    });
  }

  // Thermostat Stepper Minus (-0.5°C)
  document.getElementById('thermo-minus')?.addEventListener('click', () => {
    const t = DeviceService.get('thermostat');
    const current = Number(t?.targetTemp) || 21.0;
    const next = Math.max(5.0, Math.round((current - 0.5) * 10) / 10);
    updateThermostatLiveDisplay(next);
    DeviceService.setThermostatTemp('thermostat', next);
    DeviceService.setProperty('thermostat', 'mode', 'heat');
    sendDebouncedThermostatUpdate({ targetTemp: next, mode: 'heat' });
  });

  // Thermostat Stepper Plus (+0.5°C)
  document.getElementById('thermo-plus')?.addEventListener('click', () => {
    const t = DeviceService.get('thermostat');
    const current = Number(t?.targetTemp) || 21.0;
    const next = Math.min(35.0, Math.round((current + 0.5) * 10) / 10);
    updateThermostatLiveDisplay(next);
    DeviceService.setThermostatTemp('thermostat', next);
    DeviceService.setProperty('thermostat', 'mode', 'heat');
    sendDebouncedThermostatUpdate({ targetTemp: next, mode: 'heat' });
  });

  // Quick Preset Chips
  document.querySelectorAll('[data-preset-temp]').forEach(chip => {
    chip.addEventListener('click', () => {
      const temp = parseFloat(chip.dataset.presetTemp);
      updateThermostatLiveDisplay(temp);
      DeviceService.setThermostatTemp('thermostat', temp);
      DeviceService.setProperty('thermostat', 'mode', 'heat');
      sendDebouncedThermostatUpdate({ targetTemp: temp, mode: 'heat' });
    });
  });

  // Thermostat Mode Selector (heat, auto, eco)
  document.querySelectorAll('[data-thermo-mode]').forEach(el => {
    el.addEventListener('click', async () => {
      const targetMode = el.dataset.thermoMode;
      DeviceService.setProperty('thermostat', 'mode', targetMode);
      refreshClimatePage(); // Optimistic immediate UI highlight
      if (merossService.status.connected) {
        try {
          await merossService.setThermostat({ mode: targetMode });
          showToast(`Modo cambiado a ${targetMode === 'auto' ? 'Programado' : (targetMode === 'eco' ? 'Eco' : 'Manual')}`);
          refreshClimatePage();
        } catch (err) {
          showToast('Error al cambiar modo');
        }
      }
    });
  });

  // AC toggles
  document.querySelectorAll('[data-ac-toggle]').forEach(input => {
    input.addEventListener('change', (e) => {
      DeviceService.toggle(e.target.dataset.acToggle);
      refreshClimatePage();
    });
  });

  // AC temp +/-
  document.querySelectorAll('[data-ac-temp-minus]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.acTempMinus;
      const ac = DeviceService.get(id);
      DeviceService.setACTemp(id, ac.targetTemp - 1);
      const label = document.getElementById(`ac-target-${id}`);
      if (label) label.textContent = `${ac.targetTemp - 1}°`;
    });
  });

  document.querySelectorAll('[data-ac-temp-plus]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.acTempPlus;
      const ac = DeviceService.get(id);
      DeviceService.setACTemp(id, ac.targetTemp + 1);
      const label = document.getElementById(`ac-target-${id}`);
      if (label) label.textContent = `${ac.targetTemp + 1}°`;
    });
  });

  // AC mode
  document.querySelectorAll('[data-ac-mode]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.acMode;
      const mode = el.dataset.mode;
      DeviceService.setACMode(id, mode);
      refreshClimatePage();
    });
  });

  // AC fan speed
  document.querySelectorAll('[data-ac-fan]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.acFan;
      DeviceService.setProperty(id, 'fanSpeed', btn.dataset.speed);
      refreshClimatePage();
    });
  });
}

function refreshClimatePage() {
  const container = document.getElementById('page-content');
  if (container) {
    const page = container.firstElementChild;
    if (page) {
      page.innerHTML = renderClimate();
      initClimate();
    }
  }
}

/* ── Open Meross Cloud Login Modal ── */
function openMerossModal() {
  document.getElementById('meross-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'meross-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">🔗 Conectar Meross Cloud</div>
        <button class="modal-close" id="meross-modal-close">✕</button>
      </div>
      
      <p style="font-size:var(--font-size-xs); color:var(--text-secondary); margin-bottom:var(--space-md); text-align:left;">
        Introduce las credenciales de tu cuenta en la app <strong>Meross</strong>. Tu sesión se guardará cifrada en tu ordenador local de forma segura.
      </p>

      <form id="meross-login-form">
        <div class="form-group">
          <label class="form-label" for="meross-email">Correo de Meross</label>
          <input type="email" class="form-input" id="meross-email" placeholder="ejemplo@email.com" required autocomplete="username">
        </div>

        <div class="form-group">
          <label class="form-label" for="meross-password">Contraseña</label>
          <input type="password" class="form-input" id="meross-password" placeholder="••••••••" required autocomplete="current-password">
        </div>

        <div class="form-group">
          <label class="form-label" for="meross-mfa">Código 2FA / MFA <span style="font-weight:normal; text-transform:none; color:var(--text-tertiary);">(Solo si lo tienes activado)</span></label>
          <input type="text" class="form-input" id="meross-mfa" placeholder="Opcional">
        </div>

        <div id="meross-error-msg" style="display:none; padding:8px 12px; border-radius:var(--radius-md); background:rgba(239,83,80,0.15); border:1px solid rgba(239,83,80,0.3); color:var(--accent-red); font-size:var(--font-size-xs); margin-bottom:var(--space-md); text-align:left;"></div>

        <div style="display:flex; justify-content:flex-end; gap:var(--space-sm); margin-top:var(--space-lg);">
          <button type="button" class="btn btn--secondary" id="meross-btn-cancel">Cancelar</button>
          <button type="submit" class="btn btn--primary" id="meross-btn-submit">
            <span id="meross-btn-text">Conectar</span>
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  document.getElementById('meross-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('meross-btn-cancel')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  const form = document.getElementById('meross-login-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('meross-email').value;
    const password = document.getElementById('meross-password').value;
    const mfa = document.getElementById('meross-mfa').value;
    const errorEl = document.getElementById('meross-error-msg');
    const btnText = document.getElementById('meross-btn-text');
    const submitBtn = document.getElementById('meross-btn-submit');

    errorEl.style.display = 'none';
    btnText.textContent = 'Autenticando...';
    submitBtn.disabled = true;

    try {
      await merossService.login(email, password, mfa);
      closeModal();
      showToast('¡Conectado con éxito a tu cuenta Meross! 🎉');
      refreshClimatePage();
    } catch (err) {
      errorEl.textContent = err.message || 'Error al conectar con Meross. Revisa tu usuario y contraseña.';
      errorEl.style.display = 'block';
      btnText.textContent = 'Conectar';
      submitBtn.disabled = false;
    }
  });
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
