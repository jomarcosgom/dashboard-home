/* ============================================================
   SECURITY PAGE — SmartHome Dashboard
   Real Smart Life / Tuya Alarm Integration + PIN Keypad + Camera & Ring
   ============================================================ */

import state from '../state.js';
import DeviceService from '../services/device-service.js';
import Icons from '../icons.js';
import alarmService from '../services/alarm-service.js';
import cameraService from '../services/camera-service.js';

let enteredPin = '';
let isKeypadOpen = false;
let pendingMode = null;
let alarmUnsubscribe = null;

export function renderSecurity() {
  const camera = DeviceService.get('camera_entrada') || { on: true, brand: 'TP-Link Tapo', name: 'Cámara entrada' };
  const alarm = state.get('devices.alarm') || {
    mode: 'disarmed',
    armed: false,
    triggered: false,
    brand: 'Smart Life',
    sensors: []
  };
  const doorbell = DeviceService.get('doorbell') || { on: true, brand: 'Ring', name: 'Telefonillo Ring', battery: 78, events: [] };

  const isTriggered = alarm.triggered || alarm.mode === 'triggered';
  const isArmedAway = alarm.mode === 'armed_away';
  const isArmedHome = alarm.mode === 'armed_home';
  const isDisarmed = alarm.mode === 'disarmed';

  const heroClass = isTriggered 
    ? 'alarm-hero--triggered' 
    : (isArmedAway ? 'alarm-hero--away' : (isArmedHome ? 'alarm-hero--home' : 'alarm-hero--disarmed'));

  const heroIcon = isTriggered
    ? '🚨'
    : (isArmedAway ? Icons.shield : (isArmedHome ? Icons.home : Icons.unlock));

  const heroTitle = isTriggered
    ? '¡ALARMA DISPARADA!'
    : (isArmedAway ? 'Armada Total (Fuera)' : (isArmedHome ? 'Armada en Casa (Noche)' : 'Sistema Desarmado'));

  const heroSubtitle = isTriggered
    ? (alarm.triggeredSensor ? `Intrusión detectada: ${alarm.triggeredSensor}` : 'Alerta de intrusión o pánico SOS')
    : (isArmedAway 
        ? 'Protección perimetral y volumétrica total activa' 
        : (isArmedHome 
            ? 'Sensores perimetrales armados · Movimiento interior libre' 
            : 'Hogar seguro · Sensores en reposo'));

  const statusBadge = isTriggered
    ? '<span class="badge badge--danger"><span class="pulse-dot pulse-dot--alert"></span> ¡DISPARO!</span>'
    : (alarm.armed 
        ? '<span class="badge badge--active"><span class="pulse-dot pulse-dot--active"></span> Armada</span>' 
        : '<span class="badge badge--warning"><span class="pulse-dot pulse-dot--inactive"></span> Desarmada</span>');

  const sensors = (alarm.sensors || []).filter(s => s.id !== alarm.alarmDeviceId && !String(s.name || '').toLowerCase().includes('panel'));

  return `
    <div class="page-grid stagger-children">
      <!-- Header -->
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:var(--space-md);">
        <div>
          <h2>Seguridad</h2>
          <p style="font-size:var(--font-size-sm);">Alarma Smart Life, cámara y telefonillo</p>
        </div>
        <button class="badge sos-badge" id="sos-btn" style="padding:6px 14px; font-weight:var(--font-weight-bold); font-size:12px; border-radius:var(--radius-full);" title="Activar alerta de pánico SOS">
          🚨 SOS Pánico
        </button>
      </div>

      <!-- Smart Life Real Account Connection Card -->
      <div id="smartlife-card-container">
        ${renderSmartLifeAccountCard(alarm)}
      </div>

      <!-- Hero Alarm Card -->
      <div class="glass-card alarm-hero ${heroClass}" id="alarm-hero-card">
        <div class="alarm-hero__icon-circle" id="alarm-hero-icon-circle" style="color: ${isTriggered ? '#ff1744' : (alarm.armed ? 'var(--accent-orange)' : 'var(--accent-green)')};">
          ${typeof heroIcon === 'string' && heroIcon.length < 5 ? `<span style="font-size:2.4rem;">${heroIcon}</span>` : heroIcon}
        </div>

        <div class="alarm-hero__title" id="alarm-hero-title" style="color:${isTriggered ? 'var(--accent-red)' : 'var(--text-primary)'};">
          ${heroTitle}
        </div>
        <div class="alarm-hero__subtitle" id="alarm-hero-subtitle" style="margin-bottom:var(--space-md);">
          ${heroSubtitle}
        </div>

        <div id="alarm-hero-meta" style="display:flex; align-items:center; justify-content:center; gap:var(--space-sm); margin-bottom:var(--space-lg);">
          <span id="alarm-status-badge">${statusBadge}</span>
          <span id="alarm-last-action" style="font-size:var(--font-size-xs); color:var(--text-tertiary);">
            ${alarm.lastAction ? alarm.lastAction + (alarm.lastActionTime ? ' (' + alarm.lastActionTime + ')' : '') : 'Online'}
          </span>
          <span id="alarm-battery-text" style="font-size:var(--font-size-xs); color:var(--text-tertiary);">· 🔋 ${alarm.battery || 100}%</span>
        </div>

        <!-- Alarm Mode Buttons -->
        <div class="mode-selector" style="max-width:380px; margin:0 auto;">
          <div class="mode-selector__option ${isDisarmed ? 'mode-selector__option--active mode-selector__option--eco' : ''}" data-alarm-action="disarmed" title="Desactivar sistema">
            ${Icons.unlock} Desactivar
          </div>
          <div class="mode-selector__option ${isArmedHome ? 'mode-selector__option--active mode-selector__option--auto' : ''}" data-alarm-action="armed_home" title="Armar en casa (modo noche)">
            ${Icons.home} En Casa
          </div>
          <div class="mode-selector__option ${isArmedAway ? 'mode-selector__option--active mode-selector__option--heat' : ''}" data-alarm-action="armed_away" title="Armar fuera (protección total)">
            ${Icons.shield} Fuera
          </div>
        </div>

        <!-- Silence Button Container -->
        <div id="silence-btn-container" style="margin-top:var(--space-md);">
          ${isTriggered ? `
            <button class="btn btn--danger btn--lg ripple" id="silence-alarm-btn" style="width:100%; max-width:320px; font-weight:var(--font-weight-bold); border-radius:var(--radius-full); box-shadow:0 0 20px rgba(255,23,68,0.5);">
              🔕 DESACTIVAR SIRENA Y ALARMA
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Sensors Card -->
      <div class="glass-card">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-md); flex-wrap:wrap; gap:8px;">
          <div>
            <div style="font-weight:var(--font-weight-semibold);">Sensores Perimetrales y de Presencia</div>
            <div id="active-sensors-count" style="font-size:var(--font-size-xs); color:var(--text-tertiary);">
              ${sensors.filter(s => s.status === 'open' || s.status === 'detected').length} activos en este momento
            </div>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn btn--secondary btn--sm" id="btn-refresh-sensors" style="padding:4px 10px; font-size:11px; border-radius:var(--radius-full);" title="Actualizar estado de los sensores">
              🔄 Actualizar
            </button>
            <button class="btn btn--secondary btn--sm" id="manage-zones-btn" style="padding:4px 10px; font-size:11px; border-radius:var(--radius-full);" title="Configurar nombres y zonas de puertas y ventanas">
              🔧 Zonas y Sensores
            </button>
            <button class="btn btn--secondary btn--sm" id="alarm-config-btn" style="padding:4px 10px; font-size:11px; border-radius:var(--radius-full);" title="Ajustar código PIN o opciones">
              ⚙️ PIN
            </button>
          </div>
        </div>

        <div id="sensors-list-container" style="display:flex; flex-direction:column; gap:8px;">
          ${sensors.map(s => renderSensorRow(s)).join('')}
        </div>
      </div>

      <!-- Camera (TP-Link Tapo C230) -->
      <div class="glass-card" id="camera-card">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-md); flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:var(--space-sm);">
            <div class="device-icon device-icon--security ${camera.on ? 'device-icon--active' : ''}" id="camera-icon-wrapper">
              ${Icons.camera}
            </div>
            <div>
              <div style="font-weight:var(--font-weight-semibold); display:flex; align-items:center; gap:6px;">
                <span id="camera-display-name">Tapo C230</span>
                <span class="badge badge--active" id="camera-live-badge" style="font-size:9px; padding:1px 6px;">● DIRECTO</span>
              </div>
              <div style="font-size:var(--font-size-xs); color:var(--text-tertiary);" id="camera-meta">
                TP-Link Tapo 2K · 192.168.1.131
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn btn--secondary btn--sm" id="btn-camera-hd-modal" style="padding:4px 10px; font-size:11px; border-radius:var(--radius-full);" title="Ver en 2K Ultra HD">
              🔍 2K HD
            </button>
            <button class="btn btn--secondary btn--sm" id="btn-camera-snapshot" style="padding:4px 10px; font-size:11px; border-radius:var(--radius-full);" title="Guardar foto">
              📸 Foto
            </button>
            <button class="btn btn--secondary btn--sm" id="btn-camera-config" style="padding:4px 8px; font-size:11px; border-radius:var(--radius-full);" title="Configurar cámara">
              ⚙️
            </button>
            <label class="toggle toggle--green" title="Encender / Modo Privacidad">
              <input type="checkbox" ${camera.on ? 'checked' : ''} id="camera-toggle">
              <span class="toggle__track"></span>
            </label>
          </div>
        </div>

        <!-- Camera Live Preview -->
        <div id="camera-preview-box" class="camera-preview" style="background:#090d16; min-height:220px; border-radius:var(--radius-lg); position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; margin-bottom:var(--space-md); border:1px solid rgba(255,255,255,0.08); box-shadow:inset 0 0 30px rgba(0,0,0,0.8);">
          ${camera.on ? `
            <img id="camera-live-img" src="/api/camera/stream" style="width:100%; height:100%; min-height:220px; object-fit:cover; display:block;" alt="Vídeo en directo Tapo C230" />
            <div class="camera-preview__overlay" style="position:absolute; top:10px; left:12px; right:12px; display:flex; justify-content:space-between; align-items:center; pointer-events:none;">
              <span style="display:inline-flex; align-items:center; gap:6px; font-size:10px; padding:3px 8px; border-radius:var(--radius-full); background:rgba(0,0,0,0.65); color:#22c55e; border:1px solid rgba(34,197,94,0.3); font-weight:600;">
                <span class="pulse-dot pulse-dot--active" style="width:6px;height:6px;background:#22c55e;"></span> EN VIVO
              </span>
              <span style="font-size:10px; color:white; background:rgba(0,0,0,0.65); padding:3px 8px; border-radius:var(--radius-full); border:1px solid rgba(255,255,255,0.15); font-weight:600;">
                RTSP TCP · 640x360
              </span>
            </div>
          ` : `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:40px; text-align:center; color:var(--text-tertiary);">
              <span style="font-size:2.4rem; margin-bottom:8px;">🛡️</span>
              <div style="font-weight:600; font-size:14px; color:var(--text-secondary);">Modo Privacidad Activo</div>
              <div style="font-size:11px; color:var(--text-tertiary); margin-top:4px;">La cámara está en reposo. Actívala para ver la imagen.</div>
            </div>
          `}
        </div>

        <div style="display:flex; gap:var(--space-sm); align-items:center; justify-content:space-between; flex-wrap:wrap;">
          <div style="display:flex; gap:6px;">
            <span class="badge ${camera.on ? 'badge--active' : ''}" id="camera-status-pill">
              ${camera.on ? '● En línea' : '○ Modo Privacidad'}
            </span>
            <span class="badge badge--info" style="font-size:11px;">🛡️ Detección IA 2K</span>
          </div>
          <div style="font-size:11px; color:var(--text-tertiary);">
            Stream RTSP local sin retardo
          </div>
        </div>
      </div>

      <!-- Ring Doorbell -->
      <div class="glass-card">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-md);">
          <div style="display:flex; align-items:center; gap:var(--space-sm);">
            <div class="device-icon ${doorbell.on ? 'device-icon--active' : ''}" style="${doorbell.on ? 'background: var(--accent-purple-glow);' : ''}">
              ${Icons.bell}
            </div>
            <div>
              <div style="font-weight:var(--font-weight-semibold);">${doorbell.name}</div>
              <div style="font-size:var(--font-size-xs); color:var(--text-tertiary);">
                ${doorbell.brand} · 🔋 ${doorbell.battery}%
              </div>
            </div>
          </div>
          <span class="badge badge--active">Online</span>
        </div>

        <!-- Battery Bar -->
        <div style="margin-bottom:var(--space-md);">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Batería</span>
            <span style="font-size:var(--font-size-xs); color:${doorbell.battery > 20 ? 'var(--accent-green)' : 'var(--accent-red)'};">${doorbell.battery}%</span>
          </div>
          <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:var(--radius-full); overflow:hidden;">
            <div style="height:100%; width:${doorbell.battery}%; background:${doorbell.battery > 20 ? 'var(--gradient-success)' : 'var(--gradient-danger)'}; border-radius:var(--radius-full); transition: width 0.5s ease;"></div>
          </div>
        </div>

        <!-- Recent Events -->
        <div style="font-size:var(--font-size-xs); color:var(--text-tertiary); margin-bottom:var(--space-sm);">Historial de timbre y movimiento</div>
        <div class="event-log">
          ${(doorbell.events || [
            { type: 'ring', desc: 'Timbre pulsado en la puerta', time: '11:20' },
            { type: 'motion', desc: 'Movimiento detectado en rellano', time: '10:05' }
          ]).map(e => `
            <div class="event-log__item">
              <div class="event-log__icon" style="background: ${e.type === 'ring' ? 'var(--accent-purple-glow)' : 'var(--accent-blue-glow)'}; font-size:1rem;">
                ${e.type === 'ring' ? '🔔' : '👁️'}
              </div>
              <div class="event-log__text">
                <div class="event-log__title">${e.desc}</div>
                <div class="event-log__time">Hoy a las ${e.time}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Keypad PIN Modal (for disarming) -->
    <div class="modal-overlay" id="pin-modal" style="display:none;">
      <div class="modal-content" style="max-width:340px; text-align:center;">
        <div class="modal-header" style="justify-content:center; position:relative; margin-bottom:var(--space-xs);">
          <div class="modal-title">Introduce PIN</div>
          <button class="modal-close" id="close-pin-modal" style="position:absolute; right:0; top:0;">✕</button>
        </div>
        <p style="font-size:var(--font-size-xs); color:var(--text-secondary); margin-bottom:var(--space-md);">
          Código de seguridad para desarmar la alarma
        </p>

        <!-- PIN Dots (4) -->
        <div class="pin-display" id="pin-dots">
          <div class="pin-dot"></div>
          <div class="pin-dot"></div>
          <div class="pin-dot"></div>
          <div class="pin-dot"></div>
        </div>

        <div id="pin-error-msg" style="color:var(--accent-red); font-size:12px; min-height:18px; margin-bottom:8px;"></div>

        <!-- Keypad Numbers 3x4 -->
        <div class="keypad-grid" id="keypad-grid">
          <button class="keypad-btn" data-key="1">1</button>
          <button class="keypad-btn" data-key="2">2</button>
          <button class="keypad-btn" data-key="3">3</button>
          <button class="keypad-btn" data-key="4">4</button>
          <button class="keypad-btn" data-key="5">5</button>
          <button class="keypad-btn" data-key="6">6</button>
          <button class="keypad-btn" data-key="7">7</button>
          <button class="keypad-btn" data-key="8">8</button>
          <button class="keypad-btn" data-key="9">9</button>
          <button class="keypad-btn keypad-btn--action" id="pin-clear-btn">Limpiar</button>
          <button class="keypad-btn" data-key="0">0</button>
          <button class="keypad-btn keypad-btn--action" id="pin-backspace-btn">⌫</button>
        </div>

        <div style="margin-top:var(--space-md); font-size:10px; color:var(--text-tertiary);">
          PIN por defecto: <strong>1234</strong>
        </div>
      </div>
    </div>

    <!-- Alarm Config Modal -->
    <div class="modal-overlay" id="alarm-config-modal" style="display:none;">
      <div class="modal-content" style="max-width:400px;">
        <div class="modal-header">
          <div class="modal-title">⚙️ Ajustes de Alarma</div>
          <button class="modal-close" id="close-alarm-config-modal">✕</button>
        </div>

        <div class="form-group">
          <label class="form-label">Código PIN de Desarme (4 dígitos)</label>
          <input type="password" maxlength="4" class="form-input" id="cfg-alarm-pin" value="1234" placeholder="1234" pattern="[0-9]{4}">
          <span style="font-size:10px; color:var(--text-tertiary);">PIN requerido para apagar la alarma.</span>
        </div>

        <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-top:var(--space-md);">
          <div>
            <label class="form-label" style="margin-bottom:2px;">Exigir PIN al desarmar</label>
            <div style="font-size:11px; color:var(--text-tertiary);">Evita desarmes accidentales con un toque</div>
          </div>
          <label class="toggle toggle--green">
            <input type="checkbox" id="cfg-alarm-pin-required" checked>
            <span class="toggle__track"></span>
          </label>
        </div>

        <div class="form-group" style="margin-top:var(--space-lg); padding-top:var(--space-md); border-top:1px solid var(--glass-border);">
          <label class="form-label">Ecosistema Cloud (Smart Life / Tuya)</label>
          <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:8px;">
            Tu alarma está conectada vía Smart Life. Puedes ingresar tus credenciales de Tuya Cloud si deseas enlace directo por API.
          </div>
          <input type="text" class="form-input" id="cfg-tuya-client-id" placeholder="Client ID (Opcional)" style="margin-bottom:8px;">
          <input type="password" class="form-input" id="cfg-tuya-secret" placeholder="Client Secret (Opcional)">
        </div>

        <div style="display:flex; gap:var(--space-sm); justify-content:flex-end; margin-top:var(--space-lg);">
          <button class="btn btn--secondary" id="cancel-alarm-config-btn">Cancelar</button>
          <button class="btn btn--primary" id="save-alarm-config-btn">Guardar Ajustes</button>
        </div>
      </div>
    </div>

    <!-- Smart Life / Tuya Real Account Modal -->
    <div class="modal-overlay" id="smartlife-modal" style="display:none;">
      <div class="modal-content" style="max-width:400px;">
        <div class="modal-header">
          <div class="modal-title" style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.3rem;">🛡️</span> Conectar Alarma Smart Life
          </div>
          <button class="modal-close" id="close-smartlife-modal">✕</button>
        </div>

        <!-- Tabs -->
        <div style="display:flex; gap:4px; background:rgba(255,255,255,0.05); border-radius:var(--radius-md); padding:4px; margin-bottom:var(--space-md);">
          <button id="tab-legacy" onclick="switchAlarmTab('legacy')" style="flex:1; padding:7px 10px; border-radius:calc(var(--radius-md) - 2px); border:none; cursor:pointer; font-size:12px; font-weight:600; background:rgba(255,255,255,0.12); color:var(--text-primary); transition:all 0.2s;">
            📧 Email / Contraseña
          </button>
          <button id="tab-iot" onclick="switchAlarmTab('iot')" style="flex:1; padding:7px 10px; border-radius:calc(var(--radius-md) - 2px); border:none; cursor:pointer; font-size:12px; font-weight:600; background:transparent; color:var(--text-tertiary); transition:all 0.2s;">
            🔑 IoT Platform (Recomendado)
          </button>
        </div>

        <!-- Tab: Legacy email/password -->
        <div id="tab-panel-legacy">
          <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:var(--radius-md); padding:10px 12px; margin-bottom:var(--space-md); font-size:11px; line-height:1.5; color:var(--text-secondary);">
            <strong style="color:#f59e0b; display:block; margin-bottom:4px;">⚠️ La API legacy de Tuya no funciona con cuentas Google</strong>
            Solo funciona si creaste tu cuenta en Smart Life directamente con email y contraseña (no con Google). Si usaste Google, usa la pestaña <strong>IoT Platform</strong>.
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Aplicación</label>
            <select class="form-input" id="tuya-app-select" style="background:rgba(255,255,255,0.06); border:1px solid var(--glass-border); color:var(--text-primary); border-radius:var(--radius-md); padding:8px 12px; width:100%;">
              <option value="smart_life" selected>Smart Life</option>
              <option value="tuya">Tuya Smart</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Email de tu cuenta</label>
            <input type="email" class="form-input" id="tuya-email" placeholder="tu_correo@gmail.com" autocomplete="username">
          </div>
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Contraseña de Smart Life</label>
            <div style="position:relative;">
              <input type="password" class="form-input" id="tuya-password" placeholder="Contraseña asignada en la app" autocomplete="current-password" style="padding-right:42px;">
              <button type="button" id="tuya-toggle-pass" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:16px; padding:4px;">👁️</button>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label class="form-label">Prefijo país</label>
            <input type="text" class="form-input" id="tuya-country-code" value="34" placeholder="34">
            <span style="font-size:10px; color:var(--text-tertiary);">34 para España (+34)</span>
          </div>
        </div>

        <!-- Tab: Tuya IoT Platform -->
        <div id="tab-panel-iot" style="display:none;">
          <div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25); border-radius:var(--radius-md); padding:10px 12px; margin-bottom:var(--space-md); font-size:11px; line-height:1.5; color:var(--text-secondary);">
            <strong style="color:var(--accent-green); display:block; margin-bottom:4px;">✅ Funciona con cuentas Google y con cualquier tipo de cuenta</strong>
            Necesitas crear un proyecto gratuito en <strong>iot.tuya.com</strong> → Cloud → Create Project → Data Center: Central Europe.
            Copia el <em>Access ID</em> y el <em>Access Secret</em> de la página del proyecto.
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Región del Data Center</label>
            <select class="form-input" id="iot-region" style="background:rgba(255,255,255,0.06); border:1px solid var(--glass-border); color:var(--text-primary); border-radius:var(--radius-md); padding:8px 12px; width:100%;">
              <option value="eu" selected>Europa (Central Europe) — España</option>
              <option value="us">América (Western America)</option>
              <option value="cn">China</option>
              <option value="in">India</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Access ID / Client ID</label>
            <input type="text" class="form-input" id="iot-client-id" placeholder="xxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off" spellcheck="false">
          </div>
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Access Secret / Client Secret</label>
            <div style="position:relative;">
              <input type="password" class="form-input" id="iot-client-secret" placeholder="xxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off" spellcheck="false" style="padding-right:42px;">
              <button type="button" id="iot-toggle-secret" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:16px; padding:4px;">👁️</button>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label class="form-label">UID del usuario Smart Life <span style="color:var(--text-tertiary); font-weight:400;">(opcional)</span></label>
            <input type="text" class="form-input" id="iot-uid" placeholder="Obtenido de iot.tuya.com > Devices > Link App Account" autocomplete="off">
            <span style="font-size:10px; color:var(--text-tertiary);">Si lo dejas vacío, podrás introducirlo después de escanear el QR.</span>
          </div>
        </div>

        <div id="tuya-login-status" style="font-size:12px; min-height:18px; margin-bottom:12px; color:var(--accent-red); font-weight:var(--font-weight-medium);"></div>

        <div style="display:flex; gap:var(--space-sm); justify-content:flex-end;">
          <button class="btn btn--secondary" id="cancel-smartlife-modal">Cancelar</button>
          <button class="btn btn--primary" id="submit-smartlife-login" style="min-width:140px;">
            <span id="tuya-submit-text">Conectar Alarma</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Zones & Sensors Management Modal -->
    <div class="modal-overlay" id="zones-modal" style="display:none;">
      <div class="modal-content" style="max-width:540px; width:92%;">
        <div class="modal-header">
          <div>
            <div class="modal-title">🔧 Zonas de Sensores de Alarma</div>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
              Configura tus sensores de radiofrecuencia (433MHz) emparejados a la centralita
            </div>
          </div>
          <button class="modal-close" id="close-zones-modal">✕</button>
        </div>

        <div id="zones-list-editor" style="display:flex; flex-direction:column; gap:10px; max-height:360px; overflow-y:auto; margin:16px 0; padding-right:4px;">
          <!-- Dynamically populated rows -->
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:16px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px;">
          <button class="btn btn--secondary btn--sm" id="btn-add-zone-row" style="display:flex; align-items:center; gap:6px;">
            <span>➕</span> Añadir Zona / Sensor
          </button>
          <div style="display:flex; gap:8px;">
            <button class="btn btn--secondary" id="cancel-zones-modal">Cancelar</button>
            <button class="btn btn--primary" id="save-zones-btn">Guardar Zonas</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Camera 2K Fullscreen Modal -->
    <div class="modal-overlay" id="camera-hd-modal" style="display:none; z-index:9000;">
      <div class="modal-content" style="max-width:860px; width:94%; padding:16px;">
        <div class="modal-header" style="margin-bottom:12px;">
          <div class="modal-title" style="display:flex; align-items:center; gap:8px;">
            <span>📹 Tapo C230 — Transmisión 2K Ultra HD</span>
            <span class="badge badge--active" style="font-size:10px;">2880x1620</span>
          </div>
          <button class="modal-close" id="close-camera-hd-modal">✕</button>
        </div>
        <div style="background:#000; border-radius:var(--radius-md); overflow:hidden; position:relative; min-height:360px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.1);">
          <img id="camera-hd-img" src="" style="width:100%; height:auto; max-height:72vh; object-fit:contain; display:block;" alt="Tapo C230 HD" />
          <div id="camera-hd-loader" style="position:absolute; display:none; flex-direction:column; align-items:center; justify-content:center; color:white;">
            <span class="pulse-dot pulse-dot--active" style="width:12px;height:12px;"></span>
            <span style="font-size:12px; margin-top:8px;">Cargando stream 2K...</span>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; flex-wrap:wrap; gap:8px;">
          <span style="font-size:11px; color:var(--text-tertiary);">Resolución nativa: 2880x1620 px (Stream 1) · Audio PCM</span>
          <div style="display:flex; gap:8px;">
            <a id="btn-download-hd-photo" href="/api/camera/snapshot?hd=1" download="tapo_c230_captura.jpg" class="btn btn--primary btn--sm" style="border-radius:var(--radius-full); padding:6px 14px;">
              📸 Guardar Foto 2K
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- Camera Settings Modal -->
    <div class="modal-overlay" id="camera-config-modal" style="display:none; z-index:9000;">
      <div class="modal-content" style="max-width:420px; width:92%;">
        <div class="modal-header">
          <div class="modal-title">⚙️ Ajustes Tapo C230</div>
          <button class="modal-close" id="close-camera-config-modal">✕</button>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label">Dirección IP de la cámara</label>
          <input type="text" class="form-input" id="cfg-camera-ip" value="192.168.1.131" placeholder="192.168.1.131">
          <span style="font-size:10px; color:var(--text-tertiary);">IP asignada en tu router WiFi.</span>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label">Usuario de la cámara</label>
          <input type="text" class="form-input" id="cfg-camera-username" value="adminjj" placeholder="adminjj">
        </div>
        <div class="form-group" style="margin-bottom:16px;">
          <label class="form-label">Contraseña de la cámara</label>
          <input type="password" class="form-input" id="cfg-camera-password" placeholder="••••••••">
          <span style="font-size:10px; color:var(--text-tertiary);">Configurada en app Tapo > Ajustes > Cuenta de la cámara.</span>
        </div>
        <div id="camera-cfg-status" style="font-size:12px; min-height:16px; margin-bottom:12px; font-weight:600;"></div>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn--secondary" id="btn-cancel-camera-cfg">Cancelar</button>
          <button class="btn btn--primary" id="btn-save-camera-cfg">Guardar Ajustes</button>
        </div>
      </div>
    </div>
  `;
}


function renderSmartLifeAccountCard(alarm) {
  if (alarm.isRealTuya) {
    return `
      <div class="glass-card" style="padding: 12px 16px; background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.25); display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.4rem;">🛡️</span>
          <div>
            <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); color: var(--accent-green); display: flex; align-items: center; gap: 6px;">
              <span class="pulse-dot pulse-dot--active" style="width: 7px; height: 7px;"></span>
              Conectado a Smart Life Real
            </div>
            <div style="font-size: 11px; color: var(--text-secondary);">${alarm.realAccount || 'Cuenta activa'} · ${alarm.model || 'Centralita Alarma'}</div>
          </div>
        </div>
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
          <button class="btn btn--primary btn--sm" id="btn-reconfigure-iot" style="padding: 4px 12px; font-size: 11px; border-radius: var(--radius-full); font-weight: 600;" title="Ajustar credenciales y UID">
            🔑 Configurar UID
          </button>
          <button class="btn btn--secondary btn--sm" id="btn-sync-smartlife" style="padding: 4px 10px; font-size: 11px; border-radius: var(--radius-full);" title="Sincronizar sensores ahora">
            🔄 Sincronizar
          </button>
          <button class="btn btn--secondary btn--sm" id="btn-disconnect-smartlife" style="padding: 4px 10px; font-size: 11px; border-radius: var(--radius-full); color: var(--text-tertiary);" title="Desvincular cuenta">
            Desconectar
          </button>
        </div>
      </div>
    `;
  }
  return `
    <div class="glass-card" style="padding: 14px 16px; background: linear-gradient(135deg, rgba(255, 107, 53, 0.09), rgba(124, 58, 237, 0.09)); border: 1px solid rgba(255, 107, 53, 0.28); display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 38px; height: 38px; border-radius: var(--radius-md); background: var(--gradient-warm); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; box-shadow: var(--shadow-sm); flex-shrink: 0;">
          🔗
        </div>
        <div>
          <div style="font-weight: var(--font-weight-semibold); font-size: var(--font-size-sm);">Conectar tu Alarma Real</div>
          <div style="font-size: 11px; color: var(--text-secondary);">Vincula tu cuenta Smart Life o Tuya Smart para controlar tu centralita y sensores reales</div>
        </div>
      </div>
      <button class="btn btn--primary btn--sm ripple" id="btn-open-smartlife-login" style="border-radius: var(--radius-full); font-weight: var(--font-weight-semibold); padding: 8px 16px;">
        Conectar Smart Life
      </button>
    </div>
  `;
}

function renderSensorRow(s) {
  const isAlert = s.status === 'open' || s.status === 'detected';
  const icon = s.type === 'door' ? '🚪' : (s.type === 'window' ? '🪟' : '👁️');
  const statusLabel = (s.type === 'door' || s.type === 'window')
    ? (s.status === 'open' ? 'Abierto' : 'Cerrado')
    : ((s.status === 'detected' || s.status === 'open') ? 'Movimiento' : 'Despejado');
  const zoneBadge = s.zone ? `<span style="display:inline-block; font-size:10px; padding:1px 6px; border-radius:4px; background:rgba(255,255,255,0.08); color:var(--text-secondary); margin-left:6px; font-weight:var(--font-weight-medium);">Zona ${String(s.zone).padStart(2, '0')}</span>` : '';

  return `
    <div id="sensor-row-${s.id}" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:var(--radius-md); background:rgba(255,255,255,0.03); border:1px solid ${isAlert ? 'rgba(255,23,68,0.3)' : 'rgba(255,255,255,0.06)'}; transition:border-color 0.3s ease;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:1.3rem;">${icon}</span>
        <div>
          <div style="font-size:var(--font-size-sm); font-weight:var(--font-weight-medium); display:flex; align-items:center;">
            ${s.name}
            ${zoneBadge}
          </div>
          <div style="font-size:10px; color:var(--text-tertiary);">Batería: ${s.battery}% · ${s.lastActivity || 'En reposo'}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="badge ${isAlert ? 'badge--danger' : 'badge--active'}" id="sensor-badge-${s.id}" style="font-size:11px;">
          ${isAlert ? '<span class="pulse-dot pulse-dot--alert" style="width:5px;height:5px;"></span> ' : ''}${statusLabel}
        </span>
        <button class="btn btn--secondary btn--sm sensor-toggle-btn" data-sensor-id="${s.id}" style="padding:2px 8px; font-size:10px; border-radius:var(--radius-full);" title="Probar sensor">
          Probar
        </button>
      </div>
    </div>
  `;
}

export function initSecurity() {
  enteredPin = '';

  // Clean up any existing subscription to avoid duplicate listeners
  if (alarmUnsubscribe) {
    alarmUnsubscribe();
    alarmUnsubscribe = null;
  }

  // Subscribe to updates with targeted DOM manipulation (prevents freeze/re-render storms)
  alarmUnsubscribe = alarmService.onChange((alarm) => {
    if (window.location.hash.includes('security')) {
      updateAlarmUI(alarm);
    }
  });

  // Start polling
  alarmService.startPolling(4000);

  // Mode buttons click handlers
  document.querySelectorAll('[data-alarm-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetMode = btn.dataset.alarmAction;
      const alarm = state.get('devices.alarm') || {};

      if (targetMode === 'disarmed') {
        if (alarm.pinRequired !== false) {
          openPinModal('disarmed');
          return;
        }
      }

      btn.classList.add('scale-pop');
      showSecurityToast(`Cambiando alarma a ${targetMode === 'armed_home' ? 'Modo Casa' : 'Modo Fuera'}...`);
      const res = await alarmService.setMode(targetMode);
      if (res.success) {
        showSecurityToast(res.message || 'Alarma actualizada');
      } else {
        showSecurityToast(`Error: ${res.error}`);
      }
    });
  });

  // Silence button (when triggered)
  document.getElementById('silence-alarm-btn')?.addEventListener('click', () => {
    openPinModal('disarmed');
  });

  // SOS Emergency button
  document.getElementById('sos-btn')?.addEventListener('click', async () => {
    if (confirm('¿Deseas activar la alerta de emergencia SOS y sirena de la alarma?')) {
      const res = await alarmService.triggerSOS();
      if (res.success) {
        showSecurityToast('¡ALERTA SOS DISPARADA! 🚨');
      }
    }
  });

  // Sensor Test Buttons
  bindSensorButtons();

  // Sensors Card Refresh Button
  document.getElementById('btn-refresh-sensors')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-sensors');
    btn?.classList.add('scale-pop');
    showSecurityToast('Sincronizando estado de sensores con la centralita...');
    const res = await alarmService.refresh();
    if (res.success) {
      showSecurityToast(res.message || 'Sensores sincronizados correctamente');
    } else {
      showSecurityToast(`Error al sincronizar: ${res.error}`);
    }
    setTimeout(() => btn?.classList.remove('scale-pop'), 400);
  });

  // Tapo C230 Camera controls & live streaming
  setupCamera();

  // Keypad Modal logic
  setupKeypadModal();

  // Config Modal logic
  setupConfigModal();

  // Zones & Sensors Editor Modal logic
  setupZonesModal();

  // Smart Life Real Account Modal logic & buttons
  setupSmartLifeModal();
}

function bindSensorButtons() {
  document.querySelectorAll('.sensor-toggle-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const sensorId = btn.dataset.sensorId;
      btn.classList.add('scale-pop');
      const res = await alarmService.toggleSensor(sensorId);
      if (res.success && res.sensor) {
        const stateStr = res.sensor.status === 'open' ? 'abierta' : (res.sensor.status === 'detected' ? 'movimiento detectado' : 'cerrada');
        showSecurityToast(`${res.sensor.name}: ${stateStr}`);
      }
      setTimeout(() => btn.classList.remove('scale-pop'), 300);
    };
  });
}

function updateAlarmUI(alarm) {
  if (!alarm) return;

  const isTriggered = alarm.triggered || alarm.mode === 'triggered';
  const isArmedAway = alarm.mode === 'armed_away';
  const isArmedHome = alarm.mode === 'armed_home';
  const isDisarmed = alarm.mode === 'disarmed';

  // 1. Update Hero Card
  const heroCard = document.getElementById('alarm-hero-card');
  if (heroCard) {
    heroCard.classList.remove('alarm-hero--triggered', 'alarm-hero--away', 'alarm-hero--home', 'alarm-hero--disarmed');
    const heroClass = isTriggered 
      ? 'alarm-hero--triggered' 
      : (isArmedAway ? 'alarm-hero--away' : (isArmedHome ? 'alarm-hero--home' : 'alarm-hero--disarmed'));
    heroCard.classList.add(heroClass);
  }

  // 2. Update Icon
  const iconCircle = document.getElementById('alarm-hero-icon-circle');
  if (iconCircle) {
    iconCircle.style.color = isTriggered ? '#ff1744' : (alarm.armed ? 'var(--accent-orange)' : 'var(--accent-green)');
    const heroIcon = isTriggered
      ? '🚨'
      : (isArmedAway ? Icons.shield : (isArmedHome ? Icons.home : Icons.unlock));
    iconCircle.innerHTML = typeof heroIcon === 'string' && heroIcon.length < 5 
      ? `<span style="font-size:2.4rem;">${heroIcon}</span>` 
      : heroIcon;
  }

  // 3. Update Title & Subtitle
  const titleEl = document.getElementById('alarm-hero-title');
  if (titleEl) {
    titleEl.style.color = isTriggered ? 'var(--accent-red)' : 'var(--text-primary)';
    titleEl.textContent = isTriggered
      ? '¡ALARMA DISPARADA!'
      : (isArmedAway ? 'Armada Total (Fuera)' : (isArmedHome ? 'Armada en Casa (Noche)' : 'Sistema Desarmado'));
  }

  const subtitleEl = document.getElementById('alarm-hero-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = isTriggered
      ? (alarm.triggeredSensor ? `Intrusión detectada: ${alarm.triggeredSensor}` : 'Alerta de intrusión o pánico SOS')
      : (isArmedAway 
          ? 'Protección perimetral y volumétrica total activa' 
          : (isArmedHome 
              ? 'Sensores perimetrales armados · Movimiento interior libre' 
              : 'Hogar seguro · Sensores en reposo'));
  }

  // 4. Update Meta
  const statusBadgeEl = document.getElementById('alarm-status-badge');
  if (statusBadgeEl) {
    statusBadgeEl.innerHTML = isTriggered
      ? '<span class="badge badge--danger"><span class="pulse-dot pulse-dot--alert"></span> ¡DISPARO!</span>'
      : (alarm.armed 
          ? '<span class="badge badge--active"><span class="pulse-dot pulse-dot--active"></span> Armada</span>' 
          : '<span class="badge badge--warning"><span class="pulse-dot pulse-dot--inactive"></span> Desarmada</span>');
  }

  const lastActionEl = document.getElementById('alarm-last-action');
  if (lastActionEl) {
    lastActionEl.textContent = alarm.lastAction ? alarm.lastAction + (alarm.lastActionTime ? ' (' + alarm.lastActionTime + ')' : '') : 'Online';
  }

  const batteryEl = document.getElementById('alarm-battery-text');
  if (batteryEl) {
    batteryEl.textContent = `· 🔋 ${alarm.battery || 100}%`;
  }

  // 5. Update Mode Selector buttons
  document.querySelectorAll('[data-alarm-action]').forEach(btn => {
    const action = btn.dataset.alarmAction;
    btn.classList.remove(
      'mode-selector__option--active', 
      'mode-selector__option--eco', 
      'mode-selector__option--auto', 
      'mode-selector__option--heat'
    );
    if (action === 'disarmed' && isDisarmed) {
      btn.classList.add('mode-selector__option--active', 'mode-selector__option--eco');
    } else if (action === 'armed_home' && isArmedHome) {
      btn.classList.add('mode-selector__option--active', 'mode-selector__option--auto');
    } else if (action === 'armed_away' && isArmedAway) {
      btn.classList.add('mode-selector__option--active', 'mode-selector__option--heat');
    }
  });

  // 6. Update silence button container
  const silenceContainer = document.getElementById('silence-btn-container');
  if (silenceContainer) {
    silenceContainer.innerHTML = isTriggered ? `
      <button class="btn btn--danger btn--lg ripple" id="silence-alarm-btn" style="width:100%; max-width:320px; font-weight:var(--font-weight-bold); border-radius:var(--radius-full); box-shadow:0 0 20px rgba(255,23,68,0.5);">
        🔕 DESACTIVAR SIRENA Y ALARMA
      </button>
    ` : '';
    document.getElementById('silence-alarm-btn')?.addEventListener('click', () => {
      openPinModal('disarmed');
    });
  }

  // 7. Update sensors
  if (Array.isArray(alarm.sensors)) {
    const validSensors = alarm.sensors.filter(s => s.id !== alarm.alarmDeviceId && !String(s.name || '').toLowerCase().includes('panel'));
    const countEl = document.getElementById('active-sensors-count');
    if (countEl) {
      countEl.textContent = `${validSensors.filter(s => s.status === 'open' || s.status === 'detected').length} activos en este momento`;
    }
    const container = document.getElementById('sensors-list-container');
    if (container) {
      const firstSensor = validSensors[0];
      const namesChanged = validSensors.some(s => {
        const row = document.getElementById(`sensor-row-${s.id}`);
        return !row || !row.textContent.includes(s.name);
      });
      const needsFullRender = !firstSensor || 
        !document.getElementById(`sensor-badge-${firstSensor.id}`) || 
        container.children.length !== validSensors.length || 
        namesChanged;
      if (needsFullRender) {
        container.innerHTML = validSensors.map(s => renderSensorRow(s)).join('');
        bindSensorButtons();
      } else {
        validSensors.forEach(s => {
          const badge = document.getElementById(`sensor-badge-${s.id}`);
          const row = document.getElementById(`sensor-row-${s.id}`);
          if (badge) {
            const isAlert = s.status === 'open' || s.status === 'detected';
            badge.className = `badge ${isAlert ? 'badge--danger' : 'badge--active'}`;
            const statusLabel = (s.type === 'door' || s.type === 'window')
              ? (s.status === 'open' ? 'Abierto' : 'Cerrado')
              : ((s.status === 'detected' || s.status === 'open') ? 'Movimiento' : 'Despejado');
            badge.innerHTML = `${isAlert ? '<span class="pulse-dot pulse-dot--alert" style="width:5px;height:5px;"></span> ' : ''}${statusLabel}`;
            if (row) {
              row.style.borderColor = isAlert ? 'rgba(255,23,68,0.3)' : 'rgba(255,255,255,0.06)';
            }
          }
        });
      }
    }
  }
}

function setupSmartLifeModal() {
  const modal = document.getElementById('smartlife-modal');
  const openBtn = document.getElementById('btn-open-smartlife-login');
  const closeBtn = document.getElementById('close-smartlife-modal');
  const cancelBtn = document.getElementById('cancel-smartlife-modal');
  const submitBtn = document.getElementById('submit-smartlife-login');
  const togglePassBtn = document.getElementById('tuya-toggle-pass');
  const passwordInput = document.getElementById('tuya-password');
  const statusMsg = document.getElementById('tuya-login-status');
  const syncBtn = document.getElementById('btn-sync-smartlife');
  const disconnectBtn = document.getElementById('btn-disconnect-smartlife');
  const toggleSecretBtn = document.getElementById('iot-toggle-secret');
  const secretInput = document.getElementById('iot-client-secret');

  let activeTab = 'legacy'; // 'legacy' | 'iot'

  // Expose tab switcher globally so onclick in HTML works
  window.switchAlarmTab = (tab) => {
    activeTab = tab;
    const panelLegacy = document.getElementById('tab-panel-legacy');
    const panelIot    = document.getElementById('tab-panel-iot');
    const btnLegacy   = document.getElementById('tab-legacy');
    const btnIot      = document.getElementById('tab-iot');
    if (tab === 'legacy') {
      panelLegacy?.style && (panelLegacy.style.display = '');
      panelIot?.style    && (panelIot.style.display    = 'none');
      if (btnLegacy) { btnLegacy.style.background = 'rgba(255,255,255,0.12)'; btnLegacy.style.color = 'var(--text-primary)'; }
      if (btnIot)    { btnIot.style.background    = 'transparent';            btnIot.style.color    = 'var(--text-tertiary)'; }
    } else {
      panelLegacy?.style && (panelLegacy.style.display = 'none');
      panelIot?.style    && (panelIot.style.display    = '');
      if (btnIot)    { btnIot.style.background    = 'rgba(255,255,255,0.12)'; btnIot.style.color    = 'var(--text-primary)'; }
      if (btnLegacy) { btnLegacy.style.background = 'transparent';            btnLegacy.style.color = 'var(--text-tertiary)'; }
    }
    if (statusMsg) statusMsg.textContent = '';
  };

  const reconfigBtn = document.getElementById('btn-reconfigure-iot');

  // Open modal
  const openIotModal = () => {
    if (statusMsg) statusMsg.textContent = '';
    window.switchAlarmTab('iot');

    // Pre-fill user's UID
    const uidInput = document.getElementById('iot-uid');
    if (uidInput && !uidInput.value) {
      uidInput.value = 'eu1769091078980awtS2';
    }

    // Restore saved credentials from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('tuya_iot_credentials') || '{}');
      if (saved.clientId && document.getElementById('iot-client-id') && !document.getElementById('iot-client-id').value) {
        document.getElementById('iot-client-id').value = saved.clientId;
      }
      if (saved.clientSecret && document.getElementById('iot-client-secret') && !document.getElementById('iot-client-secret').value) {
        document.getElementById('iot-client-secret').value = saved.clientSecret;
      }
      if (saved.region && document.getElementById('iot-region')) {
        document.getElementById('iot-region').value = saved.region;
      }
      if (saved.uid && uidInput) {
        uidInput.value = saved.uid;
      }
    } catch (e) {}

    if (modal) modal.style.display = 'flex';
  };

  openBtn?.addEventListener('click', openIotModal);
  reconfigBtn?.addEventListener('click', openIotModal);

  // Close modal
  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  // Toggle password visibility (legacy)
  togglePassBtn?.addEventListener('click', () => {
    if (passwordInput) {
      const isPass = passwordInput.type === 'password';
      passwordInput.type = isPass ? 'text' : 'password';
      togglePassBtn.textContent = isPass ? '🙈' : '👁️';
    }
  });

  // Toggle secret visibility (IoT)
  toggleSecretBtn?.addEventListener('click', () => {
    if (secretInput) {
      const isPass = secretInput.type === 'password';
      secretInput.type = isPass ? 'text' : 'password';
      toggleSecretBtn.textContent = isPass ? '🙈' : '👁️';
    }
  });

  // Submit login
  submitBtn?.addEventListener('click', async () => {
    const submitText = document.getElementById('tuya-submit-text');

    submitBtn.disabled = true;
    if (submitText) submitText.textContent = 'Conectando... ⏳';
    if (statusMsg) {
      statusMsg.style.color = 'var(--text-secondary)';
      statusMsg.textContent = 'Verificando credenciales...';
    }

    let res;
    let submittedIotData = null;

    if (activeTab === 'iot') {
      const clientId     = document.getElementById('iot-client-id')?.value?.trim();
      const clientSecret = document.getElementById('iot-client-secret')?.value?.trim();
      const region       = document.getElementById('iot-region')?.value || 'eu';
      const uid          = document.getElementById('iot-uid')?.value?.trim() || undefined;

      if (!clientId || !clientSecret) {
        submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'Conectar Alarma';
        if (statusMsg) { statusMsg.style.color = 'var(--accent-red)'; statusMsg.textContent = 'Introduce el Client ID y el Client Secret.'; }
        return;
      }
      submittedIotData = { clientId, clientSecret, region, uid };
      res = await alarmService.iotLogin(submittedIotData);
    } else {
      const email       = document.getElementById('tuya-email')?.value?.trim();
      const password    = document.getElementById('tuya-password')?.value?.trim();
      const app         = document.getElementById('tuya-app-select')?.value || 'smart_life';
      const countryCode = document.getElementById('tuya-country-code')?.value?.trim() || '34';

      if (!email || !password) {
        submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'Conectar Alarma';
        if (statusMsg) { statusMsg.style.color = 'var(--accent-red)'; statusMsg.textContent = 'Por favor introduce tu email y contraseña.'; }
        return;
      }
      res = await alarmService.login({ email, password, app, countryCode });
    }

    if (res.success) {
      if (submittedIotData) {
        try {
          localStorage.setItem('tuya_iot_credentials', JSON.stringify(submittedIotData));
        } catch (e) {}
      }
      if (statusMsg) {
        statusMsg.style.color = 'var(--accent-green)';
        statusMsg.textContent = '✓ ¡Conexión establecida con éxito!';
      }
      showSecurityToast(res.message || 'Alarma conectada.');
      if (res.needsUid) {
        // Show a hint about the uid
        if (statusMsg) {
          statusMsg.textContent += ' Vincula tu cuenta Smart Life desde iot.tuya.com > Devices > Link App Account para ver los dispositivos.';
        }
      }
      setTimeout(() => {
        closeModal();
        const cardContainer = document.getElementById('smartlife-card-container');
        if (cardContainer && res.alarm) {
          cardContainer.innerHTML = renderSmartLifeAccountCard(res.alarm);
          setupSmartLifeModal();
        }
      }, 700);
    } else {
      submitBtn.disabled = false;
      if (submitText) submitText.textContent = 'Conectar Alarma';
      if (statusMsg) {
        statusMsg.style.color = 'var(--accent-red)';
        statusMsg.textContent = res.error || 'Error de inicio de sesión.';
      }
    }
  });

  // Sync button
  syncBtn?.addEventListener('click', async () => {
    syncBtn.classList.add('scale-pop');
    showSecurityToast('Sincronizando dispositivos con Smart Life...');
    const res = await alarmService.refresh();
    if (res.success) {
      showSecurityToast(res.message || 'Dispositivos actualizados');
    } else {
      showSecurityToast(`Error al sincronizar: ${res.error}`);
    }
  });

  // Disconnect button
  disconnectBtn?.addEventListener('click', async () => {
    if (confirm('¿Deseas desvincular tu cuenta de Smart Life? El sistema volverá a operar en modo local.')) {
      showSecurityToast('Desvinculando cuenta...');
      const res = await alarmService.logout();
      if (res.success) {
        showSecurityToast('Cuenta desvinculada');
        const cardContainer = document.getElementById('smartlife-card-container');
        if (cardContainer) {
          cardContainer.innerHTML = renderSmartLifeAccountCard(state.get('devices.alarm') || {});
          setupSmartLifeModal();
        }
      }
    }
  });
}

function openPinModal(mode) {
  pendingMode = mode;
  enteredPin = '';
  isKeypadOpen = true;
  updatePinDots();
  const errorMsg = document.getElementById('pin-error-msg');
  if (errorMsg) errorMsg.textContent = '';
  const modal = document.getElementById('pin-modal');
  if (modal) modal.style.display = 'flex';
}

function closePinModal() {
  isKeypadOpen = false;
  enteredPin = '';
  const modal = document.getElementById('pin-modal');
  if (modal) modal.style.display = 'none';
}

function setupKeypadModal() {
  document.getElementById('close-pin-modal')?.addEventListener('click', closePinModal);

  // Keypad number buttons
  document.querySelectorAll('.keypad-btn[data-key]').forEach(btn => {
    btn.onclick = async () => {
      if (enteredPin.length < 4) {
        enteredPin += btn.dataset.key;
        updatePinDots();

        // When 4 digits entered, verify
        if (enteredPin.length === 4) {
          const pinToVerify = enteredPin;
          showSecurityToast('Comprobando código PIN...');
          const res = await alarmService.setMode(pendingMode || 'disarmed', pinToVerify);

          if (res.success) {
            showSecurityToast('✓ PIN correcto. Alarma desactivada.');
            closePinModal();
          } else {
            const keypad = document.getElementById('keypad-grid');
            const errorMsg = document.getElementById('pin-error-msg');
            if (keypad) {
              keypad.classList.add('keypad-shake');
              setTimeout(() => keypad.classList.remove('keypad-shake'), 500);
            }
            if (errorMsg) errorMsg.textContent = res.error || 'Código PIN incorrecto';
            enteredPin = '';
            setTimeout(updatePinDots, 200);
          }
        }
      }
    };
  });

  // Clear button
  const clearBtn = document.getElementById('pin-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      enteredPin = '';
      updatePinDots();
    };
  }

  // Backspace button
  const backspaceBtn = document.getElementById('pin-backspace-btn');
  if (backspaceBtn) {
    backspaceBtn.onclick = () => {
      if (enteredPin.length > 0) {
        enteredPin = enteredPin.slice(0, -1);
        updatePinDots();
      }
    };
  }
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pin-dots .pin-dot');
  dots.forEach((dot, index) => {
    if (index < enteredPin.length) {
      dot.classList.add('pin-dot--filled');
    } else {
      dot.classList.remove('pin-dot--filled');
    }
  });
}

function setupConfigModal() {
  const configModal = document.getElementById('alarm-config-modal');
  const openBtn = document.getElementById('alarm-config-btn');
  const closeBtn = document.getElementById('close-alarm-config-modal');
  const cancelBtn = document.getElementById('cancel-alarm-config-btn');
  const saveBtn = document.getElementById('save-alarm-config-btn');

  openBtn?.addEventListener('click', () => {
    if (configModal) configModal.style.display = 'flex';
  });

  const closeModal = () => {
    if (configModal) configModal.style.display = 'none';
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  saveBtn?.addEventListener('click', async () => {
    const pin = document.getElementById('cfg-alarm-pin')?.value;
    const pinRequired = document.getElementById('cfg-alarm-pin-required')?.checked;
    const clientId = document.getElementById('cfg-tuya-client-id')?.value;
    const secret = document.getElementById('cfg-tuya-secret')?.value;

    if (pin && pin.length !== 4) {
      alert('El código PIN debe tener exactamente 4 dígitos numéricos.');
      return;
    }

    const res = await alarmService.updateConfig({
      pinCode: pin || undefined,
      pinRequired,
      config: (clientId || secret) ? { clientId, clientSecret: secret } : undefined
    });

    if (res.success) {
      showSecurityToast('Ajustes de alarma guardados con éxito');
      closeModal();
    } else {
      alert(res.error || 'Error guardando ajustes');
    }
  });
}

function setupZonesModal() {
  const modal = document.getElementById('zones-modal');
  const openBtn = document.getElementById('manage-zones-btn');
  const closeBtn = document.getElementById('close-zones-modal');
  const cancelBtn = document.getElementById('cancel-zones-modal');
  const saveBtn = document.getElementById('save-zones-btn');
  const addBtn = document.getElementById('btn-add-zone-row');
  const listContainer = document.getElementById('zones-list-editor');

  if (!modal || !openBtn) return;

  function renderEditorRows(sensorList) {
    if (!sensorList || sensorList.length === 0) {
      listContainer.innerHTML = '<div style="font-size:12px; color:var(--text-tertiary); text-align:center; padding:16px;">No hay zonas configuradas todavía. Haz clic en "➕ Añadir Zona / Sensor" para agregar una.</div>';
      return;
    }
    listContainer.innerHTML = sensorList.map((s, idx) => `
      <div class="zone-editor-row" data-id="${s.id || ''}" style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:var(--radius-md);">
        <div style="display:flex; flex-direction:column; width:65px;">
          <label style="font-size:9px; color:var(--text-tertiary);">Zona</label>
          <input type="number" min="1" max="99" class="form-input zone-num-input" value="${s.zone !== undefined ? s.zone : (idx + 1)}" style="padding:4px 6px; font-size:12px; height:28px;">
        </div>
        <div style="display:flex; flex-direction:column; flex:1;">
          <label style="font-size:9px; color:var(--text-tertiary);">Nombre del Sensor / Ubicación</label>
          <input type="text" class="form-input zone-name-input" value="${s.name}" placeholder="Ej: Puerta Cocina" style="padding:4px 8px; font-size:12px; height:28px;">
        </div>
        <div style="display:flex; flex-direction:column; width:115px;">
          <label style="font-size:9px; color:var(--text-tertiary);">Tipo</label>
          <select class="form-select zone-type-input" style="padding:4px 6px; font-size:12px; height:28px;">
            <option value="door" ${s.type === 'door' ? 'selected' : ''}>🚪 Puerta</option>
            <option value="window" ${s.type === 'window' ? 'selected' : ''}>🪟 Ventana</option>
            <option value="motion" ${s.type === 'motion' ? 'selected' : ''}>👁️ Presencia</option>
          </select>
        </div>
        <button type="button" class="btn-delete-zone" style="background:none; border:none; color:var(--accent-red); cursor:pointer; font-size:16px; padding:4px 6px; margin-top:14px;" title="Eliminar sensor">🗑️</button>
      </div>
    `).join('');

    listContainer.querySelectorAll('.btn-delete-zone').forEach(btn => {
      btn.onclick = () => {
        const row = btn.closest('.zone-editor-row');
        row?.remove();
      };
    });
  }

  openBtn.onclick = () => {
    const alarm = state.get('devices.alarm') || {};
    const sensors = (alarm.sensors || []).filter(s => s.id !== alarm.alarmDeviceId && !String(s.name || '').toLowerCase().includes('panel'));
    renderEditorRows(sensors);
    modal.style.display = 'flex';
  };

  const closeModal = () => { modal.style.display = 'none'; };
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  addBtn?.addEventListener('click', () => {
    const existing = listContainer.querySelectorAll('.zone-editor-row').length;
    const nextZone = existing + 1;
    const newRow = document.createElement('div');
    newRow.className = 'zone-editor-row';
    newRow.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:var(--radius-md);';
    newRow.innerHTML = `
      <div style="display:flex; flex-direction:column; width:65px;">
        <label style="font-size:9px; color:var(--text-tertiary);">Zona</label>
        <input type="number" min="1" max="99" class="form-input zone-num-input" value="${nextZone}" style="padding:4px 6px; font-size:12px; height:28px;">
      </div>
      <div style="display:flex; flex-direction:column; flex:1;">
        <label style="font-size:9px; color:var(--text-tertiary);">Nombre del Sensor / Ubicación</label>
        <input type="text" class="form-input zone-name-input" value="Sensor Zona ${String(nextZone).padStart(2, '0')}" style="padding:4px 8px; font-size:12px; height:28px;">
      </div>
      <div style="display:flex; flex-direction:column; width:115px;">
        <label style="font-size:9px; color:var(--text-tertiary);">Tipo</label>
        <select class="form-select zone-type-input" style="padding:4px 6px; font-size:12px; height:28px;">
          <option value="door">🚪 Puerta</option>
          <option value="window">🪟 Ventana</option>
          <option value="motion">👁️ Presencia</option>
        </select>
      </div>
      <button type="button" class="btn-delete-zone" style="background:none; border:none; color:var(--accent-red); cursor:pointer; font-size:16px; padding:4px 6px; margin-top:14px;" title="Eliminar sensor">🗑️</button>
    `;
    newRow.querySelector('.btn-delete-zone').onclick = () => newRow.remove();
    listContainer.appendChild(newRow);
  });

  saveBtn?.addEventListener('click', async () => {
    const rows = listContainer.querySelectorAll('.zone-editor-row');
    const newSensors = [];
    rows.forEach((row, idx) => {
      const zoneNum = parseInt(row.querySelector('.zone-num-input')?.value, 10) || (idx + 1);
      const name = row.querySelector('.zone-name-input')?.value.trim() || `Sensor Zona ${String(zoneNum).padStart(2, '0')}`;
      const type = row.querySelector('.zone-type-input')?.value || 'door';
      newSensors.push({
        id: `zone_${String(zoneNum).padStart(2, '0')}`,
        zone: zoneNum,
        name,
        type,
        status: type === 'motion' ? 'clear' : 'closed',
        battery: 95,
        online: true,
        lastActivity: 'En reposo'
      });
    });

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    const res = await alarmService.saveSensors(newSensors);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar Zonas';

    if (res.success) {
      closeModal();
      showSecurityToast('¡Zonas de sensores actualizadas con éxito!');
    } else {
      showSecurityToast(`Error: ${res.error}`);
    }
  });
}

function showSecurityToast(msg) {
  const toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast--success';
  toast.textContent = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast--exit');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function setupCamera() {
  const cameraToggle = document.getElementById('camera-toggle');
  const cameraIconWrapper = document.getElementById('camera-icon-wrapper');
  const cameraLiveBadge = document.getElementById('camera-live-badge');
  const cameraStatusPill = document.getElementById('camera-status-pill');
  const cameraPreviewBox = document.getElementById('camera-preview-box');

  // Toggle Camera On / Privacy Mode
  cameraToggle?.addEventListener('change', async () => {
    const isOn = cameraToggle.checked;
    showSecurityToast(isOn ? 'Iniciando transmisión en directo...' : 'Activando modo privacidad...');
    const cam = await cameraService.toggle();
    if (cam) {
      if (cam.on) {
        if (cameraIconWrapper) cameraIconWrapper.classList.add('device-icon--active');
        if (cameraLiveBadge) cameraLiveBadge.style.display = 'inline-block';
        if (cameraStatusPill) {
          cameraStatusPill.className = 'badge badge--active';
          cameraStatusPill.textContent = '● En línea';
        }
        if (cameraPreviewBox) {
          cameraPreviewBox.innerHTML = `
            <img id="camera-live-img" src="/api/camera/stream?t=${Date.now()}" style="width:100%; height:100%; min-height:220px; object-fit:cover; display:block;" alt="Vídeo en directo Tapo C230" />
            <div class="camera-preview__overlay" style="position:absolute; top:10px; left:12px; right:12px; display:flex; justify-content:space-between; align-items:center; pointer-events:none;">
              <span style="display:inline-flex; align-items:center; gap:6px; font-size:10px; padding:3px 8px; border-radius:var(--radius-full); background:rgba(0,0,0,0.65); color:#22c55e; border:1px solid rgba(34,197,94,0.3); font-weight:600;">
                <span class="pulse-dot pulse-dot--active" style="width:6px;height:6px;background:#22c55e;"></span> EN VIVO
              </span>
              <span style="font-size:10px; color:white; background:rgba(0,0,0,0.65); padding:3px 8px; border-radius:var(--radius-full); border:1px solid rgba(255,255,255,0.15); font-weight:600;">
                RTSP TCP · 640x360
              </span>
            </div>
          `;
        }
        showSecurityToast('Cámara Tapo C230 transmitiendo en directo');
      } else {
        if (cameraIconWrapper) cameraIconWrapper.classList.remove('device-icon--active');
        if (cameraLiveBadge) cameraLiveBadge.style.display = 'none';
        if (cameraStatusPill) {
          cameraStatusPill.className = 'badge';
          cameraStatusPill.textContent = '○ Modo Privacidad';
        }
        if (cameraPreviewBox) {
          cameraPreviewBox.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:40px; text-align:center; color:var(--text-tertiary);">
              <span style="font-size:2.4rem; margin-bottom:8px;">🛡️</span>
              <div style="font-weight:600; font-size:14px; color:var(--text-secondary);">Modo Privacidad Activo</div>
              <div style="font-size:11px; color:var(--text-tertiary); margin-top:4px;">La cámara está en reposo. Actívala para ver la imagen.</div>
            </div>
          `;
        }
        showSecurityToast('Modo Privacidad activado');
      }
    }
  });

  // 2K HD Modal
  const hdModal = document.getElementById('camera-hd-modal');
  const hdImg = document.getElementById('camera-hd-img');
  const btnOpenHd = document.getElementById('btn-camera-hd-modal');
  const btnCloseHd = document.getElementById('close-camera-hd-modal');
  const downloadHdBtn = document.getElementById('btn-download-hd-photo');

  btnOpenHd?.addEventListener('click', () => {
    if (hdModal && hdImg) {
      hdModal.style.display = 'flex';
      hdImg.src = cameraService.getStreamUrl(true);
      if (downloadHdBtn) {
        downloadHdBtn.href = `/api/camera/snapshot?hd=1&t=${Date.now()}`;
      }
    }
  });

  const closeHd = () => {
    if (hdModal && hdImg) {
      hdModal.style.display = 'none';
      hdImg.src = ''; // Cancel the 2K RTSP stream to save CPU & camera bandwidth
    }
  };

  btnCloseHd?.addEventListener('click', closeHd);
  hdModal?.addEventListener('click', (e) => {
    if (e.target === hdModal) closeHd();
  });

  // Instant Snapshot Download
  const snapshotBtn = document.getElementById('btn-camera-snapshot');
  snapshotBtn?.addEventListener('click', () => {
    snapshotBtn.classList.add('scale-pop');
    showSecurityToast('Obteniendo instantánea de la cámara...');
    const link = document.createElement('a');
    link.href = `/api/camera/snapshot?t=${Date.now()}`;
    link.download = `tapo_c230_${Date.now()}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => snapshotBtn.classList.remove('scale-pop'), 400);
  });

  // Camera Config Modal
  const cfgModal = document.getElementById('camera-config-modal');
  const btnOpenCfg = document.getElementById('btn-camera-config');
  const btnCloseCfg = document.getElementById('close-camera-config-modal');
  const btnCancelCfg = document.getElementById('btn-cancel-camera-cfg');
  const btnSaveCfg = document.getElementById('btn-save-camera-cfg');
  const cfgStatus = document.getElementById('camera-cfg-status');

  btnOpenCfg?.addEventListener('click', async () => {
    if (cfgModal) {
      cfgModal.style.display = 'flex';
      if (cfgStatus) cfgStatus.textContent = '';
      const cam = await cameraService.getStatus();
      if (cam) {
        const ipInput = document.getElementById('cfg-camera-ip');
        const userInput = document.getElementById('cfg-camera-username');
        const passInput = document.getElementById('cfg-camera-password');
        if (ipInput && cam.ip) ipInput.value = cam.ip;
        if (userInput && cam.username) userInput.value = cam.username;
        if (passInput) passInput.value = '';
      }
    }
  });

  const closeCfg = () => {
    if (cfgModal) cfgModal.style.display = 'none';
  };

  btnCloseCfg?.addEventListener('click', closeCfg);
  btnCancelCfg?.addEventListener('click', closeCfg);
  cfgModal?.addEventListener('click', (e) => {
    if (e.target === cfgModal) closeCfg();
  });

  btnSaveCfg?.addEventListener('click', async () => {
    const ip = document.getElementById('cfg-camera-ip')?.value.trim();
    const username = document.getElementById('cfg-camera-username')?.value.trim();
    const password = document.getElementById('cfg-camera-password')?.value.trim();

    if (!ip || !username) {
      if (cfgStatus) {
        cfgStatus.style.color = 'var(--accent-red)';
        cfgStatus.textContent = 'Introduce al menos la IP y el usuario.';
      }
      return;
    }

    if (cfgStatus) {
      cfgStatus.style.color = 'var(--accent-blue)';
      cfgStatus.textContent = 'Guardando y probando conexión...';
    }

    btnSaveCfg.disabled = true;
    const res = await cameraService.saveConfig({
      ip,
      username,
      ...(password ? { password } : {})
    });
    btnSaveCfg.disabled = false;

    if (res.success) {
      if (cfgStatus) {
        cfgStatus.style.color = 'var(--accent-green)';
        cfgStatus.textContent = '¡Ajustes guardados!';
      }
      showSecurityToast('Ajustes de cámara guardados');
      setTimeout(() => {
        closeCfg();
        // Refresh preview image stream
        const liveImg = document.getElementById('camera-live-img');
        if (liveImg) {
          liveImg.src = `/api/camera/stream?t=${Date.now()}`;
        }
      }, 700);
    } else {
      if (cfgStatus) {
        cfgStatus.style.color = 'var(--accent-red)';
        cfgStatus.textContent = res.error || 'Error al guardar.';
      }
    }
  });
}

