/* ============================================================
   SERVER — SmartHome Dashboard Backend (Node.js)
   Serves PWA frontend + Meross Cloud IoT API bridge
   ============================================================ */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');
const MerossCloud = require('meross-cloud');

const PORT = process.env.PORT || 8080;
const SESSION_FILE = path.join(__dirname, '.meross_session.json');

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Meross state holder
let merossClient = null;
let merossConnected = false;
let activeThermostat = null;
let lastThermostatData = null;

// ── Tuya / Smart Life Cloud API Client ──
const ALARM_SESSION_FILE = path.join(__dirname, '.alarm_session.json');

let tuyaSession = {
  email: null,
  password: null,
  countryCode: '34',
  bizType: 'smart_life',
  host: 'px1.tuyaeu.com',
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
  alarmDeviceId: null
};

// ── Tuya IoT Platform (iot.tuya.com) — Modern Open API ──
let iotSession = {
  clientId: null,
  clientSecret: null,
  region: 'eu',            // 'eu' | 'us' | 'cn' | 'in'
  accessToken: null,
  refreshToken: null,
  uid: null,               // linked Smart Life user ID (from QR link)
  expiresAt: 0,
  isConnected: false
};

// ── TP-Link Tapo Camera Configuration ──
const CAMERA_SESSION_FILE = path.join(__dirname, '.camera_session.json');

const DEFAULT_CAMERA_STATE = {
  connected: false,
  brand: 'TP-Link Tapo',
  model: 'Tapo C230',
  ip: '192.168.1.131',
  username: 'adminjj',
  password: '',
  port: 554,
  stream: 'stream2',
  hdStream: 'stream1',
  online: true,
  lastActivity: 'En línea',
  on: true
};

let cameraState = { ...DEFAULT_CAMERA_STATE };
let lastCameraFrame = null;
let lastCameraFrameTime = 0;

function restoreCameraSession() {
  if (fs.existsSync(CAMERA_SESSION_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CAMERA_SESSION_FILE, 'utf8'));
      if (data) {
        cameraState = { ...DEFAULT_CAMERA_STATE, ...data };
        console.log(`[Cámara] Sesión restaurada: ${cameraState.model} (${cameraState.ip})`);
      }
    } catch (e) {
      console.warn('[Cámara] Error leyendo sesión de cámara guardada:', e.message);
    }
  }
}

function saveCameraSession() {
  try {
    fs.writeFileSync(CAMERA_SESSION_FILE, JSON.stringify(cameraState, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Cámara] Error guardando sesión de cámara:', e.message);
  }
}

const IOT_REGIONS = {
  eu: 'openapi.tuyaeu.com',
  us: 'openapi.tuyaus.com',
  cn: 'openapi.tuyacn.com',
  in: 'openapi.tuyain.com'
};

// Make a signed Tuya IoT Platform API request
function tuyaIotRequest(method, path, body = null, token = '') {
  const clientId = iotSession.clientId;
  const secret   = iotSession.clientSecret;
  const host     = IOT_REGIONS[iotSession.region] || IOT_REGIONS.eu;

  const t        = Date.now().toString();
  const bodyStr  = body ? JSON.stringify(body) : '';
  const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const signStr  = clientId + token + t + [method, bodyHash, '', path].join('\n');
  const sign     = crypto.createHmac('sha256', secret).update(signStr).digest('hex').toUpperCase();

  return new Promise((resolve, reject) => {
    const headers = {
      'client_id':    clientId,
      'sign':         sign,
      't':            t,
      'sign_method':  'HMAC-SHA256',
      'Content-Type': 'application/json'
    };
    if (token) headers['access_token'] = token;

    const options = {
      hostname: host,
      port: 443,
      path,
      method,
      headers,
      timeout: 12000
    };

    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(d || '{}') });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: d, error: e.message });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Tuya IoT API timeout')); });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Obtain/refresh access token from Tuya IoT Platform
async function tuyaIotGetToken() {
  const res = await tuyaIotRequest('GET', '/v1.0/token?grant_type=1');
  if (!res.data || !res.data.success) {
    const msg = res.data?.msg || res.data?.message || JSON.stringify(res.data);
    throw new Error(`Tuya IoT token error: ${msg}`);
  }
  const result = res.data.result;
  iotSession.accessToken  = result.access_token;
  iotSession.refreshToken = result.refresh_token;
  iotSession.devUid       = result.uid; // Store developer UID separately, do not overwrite app user UID
  iotSession.expiresAt    = Date.now() + (result.expire_time * 1000);
  return result;
}

// Ensure iotSession has a valid token (refresh if needed)
async function tuyaIotEnsureToken() {
  if (iotSession.accessToken && Date.now() < iotSession.expiresAt - 60000) {
    return; // still valid
  }
  if (iotSession.refreshToken && Date.now() < iotSession.expiresAt + 86400000) {
    // try refresh
    try {
      const res = await tuyaIotRequest('GET', `/v1.0/token/${iotSession.refreshToken}`);
      if (res.data?.success) {
        const result = res.data.result;
        iotSession.accessToken  = result.access_token;
        iotSession.refreshToken = result.refresh_token;
        iotSession.expiresAt    = Date.now() + (result.expire_time * 1000);
        return;
      }
    } catch (e) { /* fall through to full re-auth */ }
  }
  await tuyaIotGetToken();
}

// Device specifications cache
const deviceSpecsCache = {};

async function tuyaIotGetDeviceSpecs(deviceId) {
  if (deviceSpecsCache[deviceId]) return deviceSpecsCache[deviceId];
  await tuyaIotEnsureToken();
  try {
    const res = await tuyaIotRequest('GET', `/v1.0/devices/${deviceId}/specifications`, null, iotSession.accessToken);
    if (res.data?.success && res.data.result) {
      deviceSpecsCache[deviceId] = res.data.result;
      return res.data.result;
    }
  } catch (e) {
    console.warn(`[TuyaIoT] Error obteniendo especificaciones para ${deviceId}:`, e.message);
  }
  return null;
}

// Get devices for a linked Smart Life user
async function tuyaIotGetDevices(uid) {
  await tuyaIotEnsureToken();
  const userId = uid || iotSession.uid;
  if (!userId) {
    console.log('[TuyaIoT] No hay UID de cuenta Smart Life configurado todavía.');
    return [];
  }
  console.log(`[TuyaIoT] Consultando dispositivos para el usuario UID: ${userId}...`);
  const res = await tuyaIotRequest('GET', `/v1.0/users/${userId}/devices`, null, iotSession.accessToken);
  if (res.data?.success && Array.isArray(res.data.result)) {
    const allDevices = [...res.data.result];
    console.log(`[TuyaIoT] ¡Éxito! Encontrados ${allDevices.length} dispositivos directos.`);

    // Check if any device has sub-devices (gateways, alarms, zigbee hubs)
    for (const dev of res.data.result) {
      try {
        const subRes = await tuyaIotRequest('GET', `/v1.0/devices/${dev.id}/sub-devices`, null, iotSession.accessToken);
        if (subRes.data?.success && Array.isArray(subRes.data.result) && subRes.data.result.length > 0) {
          console.log(`[TuyaIoT] Encontrados ${subRes.data.result.length} sub-dispositivos bajo '${dev.name}' [${dev.id}]`);
          allDevices.push(...subRes.data.result);
        }
      } catch (subErr) {
        console.warn(`[TuyaIoT] Error consultando sub-dispositivos de ${dev.id}:`, subErr.message);
      }
    }
    return allDevices;
  }
  console.warn('[TuyaIoT] getDevices result:', res.data);
  return [];
}

// Send control command to Tuya IoT device (arm, disarm, home)
async function tuyaIotControlAlarm(deviceId, mode) {
  await tuyaIotEnsureToken();
  console.log(`[TuyaIoT] Solicitud de cambio a '${mode}' para dispositivo ${deviceId}...`);

  // Try to inspect device specifications to find the exact function code and range
  const specs = await tuyaIotGetDeviceSpecs(deviceId);
  let commandCode = 'master_mode';
  let commandValue = mode === 'disarmed' ? 'disarmed' : (mode === 'armed_home' ? 'home' : 'arm');

  if (specs && Array.isArray(specs.functions)) {
    const fn = specs.functions.find(f =>
      f.code === 'master_mode' ||
      f.code === 'alarm_state' ||
      f.code === 'arm_mode' ||
      f.code === 'mode' ||
      f.code.includes('arm')
    );
    if (fn) {
      commandCode = fn.code;
      try {
        const valObj = typeof fn.values === 'string' ? JSON.parse(fn.values) : fn.values;
        const range = valObj?.range || [];
        console.log(`[TuyaIoT] DP '${commandCode}' soporta valores:`, range);
        if (mode === 'disarmed') {
          commandValue = range.find(v => v === 'disarmed' || v === 'disarm') || (range[0] || 'disarmed');
        } else if (mode === 'armed_home') {
          commandValue = range.find(v => v === 'home' || v === 'part_arm' || v === 'stay') || (range[1] || 'home');
        } else if (mode === 'armed_away') {
          commandValue = range.find(v => v === 'arm' || v === 'away') || (range[2] || 'arm');
        } else if (mode === 'triggered') {
          commandValue = range.find(v => v === 'sos' || v === 'alarm') || 'sos';
        }
      } catch (e) {}
    }
  }

  console.log(`[TuyaIoT] Transmitiendo { code: '${commandCode}', value: '${commandValue}' } a ${deviceId}...`);
  let res = await tuyaIotRequest('POST', `/v1.0/devices/${deviceId}/commands`, {
    commands: [{ code: commandCode, value: commandValue }]
  }, iotSession.accessToken);

  if (!res.data?.success) {
    // If specific code failed, try alternative codes
    const candidates = [
      { code: 'master_mode', value: mode === 'disarmed' ? 'disarmed' : (mode === 'armed_home' ? 'home' : 'arm') },
      { code: 'alarm_state', value: mode === 'disarmed' ? 'disarm' : (mode === 'armed_home' ? 'home' : 'arm') },
      { code: 'arm_mode',    value: mode === 'disarmed' ? 'disarm' : (mode === 'armed_home' ? 'home' : 'arm') }
    ];
    for (const alt of candidates) {
      if (alt.code === commandCode) continue;
      console.log(`[TuyaIoT] Probando alternativa { code: '${alt.code}', value: '${alt.value}' }...`);
      res = await tuyaIotRequest('POST', `/v1.0/devices/${deviceId}/commands`, {
        commands: [alt]
      }, iotSession.accessToken);
      if (res.data?.success) break;
    }
  }

  console.log('[TuyaIoT] Resultado final de la orden:', JSON.stringify(res.data));
  return res.data;
}

// Map IoT Platform device list to alarm/sensor format
function mapIotDevicesToAlarm(devices) {
  if (!Array.isArray(devices) || devices.length === 0) return;
  console.log(`[TuyaIoT] Procesando ${devices.length} dispositivos IoT...`);

  let alarmDev = devices.find(d => {
    const cat  = (d.category || '').toLowerCase();
    const name = (d.name || '').toLowerCase();
    return cat === 'mal' || cat === 'ywbj' || cat === 'wg2' || cat === 'alarm' || name.includes('alarma') || name.includes('centralita') || name.includes('panel') || name.includes('security');
  });
  if (!alarmDev && devices.length > 0) alarmDev = devices[0];

  if (alarmDev) {
    alarmState.alarmDeviceId = alarmDev.id;
    alarmState.model = alarmDev.name || 'Smart Security Panel';
    console.log(`[TuyaIoT] ★ Alarma/Hub: ${alarmDev.name} [${alarmDev.id}]`);
  }

  const mappedSensors = [];
  devices.forEach((d, idx) => {
    // Skip the central alarm hub itself
    if (alarmDev && d.id === alarmDev.id) return;
    const name      = d.name || `Dispositivo ${idx + 1}`;
    const nameLower = name.toLowerCase();
    const cat       = (d.category || '').toLowerCase();

    let sensorType = 'door';
    if (cat === 'mcs' || nameLower.includes('ventana') || nameLower.includes('window')) sensorType = 'window';
    else if (cat === 'pir' || nameLower.includes('pir') || nameLower.includes('movimiento') || nameLower.includes('motion')) sensorType = 'motion';

    const isOnline = d.online !== false;
    mappedSensors.push({
      id: d.id,
      name,
      type: sensorType,
      status: sensorType === 'motion' ? 'clear' : 'closed',
      battery: 95,
      online: isOnline,
      lastActivity: isOnline ? 'En línea' : 'Offline'
    });
  });

  // Ensure central alarm panel is never placed inside sensors list
  alarmState.sensors = (alarmState.sensors || []).filter(s => s.id !== alarmState.alarmDeviceId && !String(s.name || '').toLowerCase().includes('panel'));

  if (mappedSensors.length > 0) {
    alarmState.sensors = mappedSensors;
    console.log(`[TuyaIoT] ${mappedSensors.length} sensores vinculados.`);
  } else {
    // If no separate sub-devices exist in cloud (common for 433MHz RF alarm panels like ZX-G03)
    if (!alarmState.sensors || alarmState.sensors.length === 0) {
      alarmState.sensors = [
        { id: 'zone_02', zone: 2, name: 'Puerta Principal', type: 'door', status: 'closed', battery: 95, online: true, lastActivity: 'En reposo' },
        { id: 'zone_03', zone: 3, name: 'Puerta Cocina', type: 'door', status: 'closed', battery: 95, online: true, lastActivity: 'En reposo' },
        { id: 'zone_04', zone: 4, name: 'Ventana Salón', type: 'window', status: 'closed', battery: 95, online: true, lastActivity: 'En reposo' },
        { id: 'zone_05', zone: 5, name: 'Ventana Dormitorio', type: 'window', status: 'closed', battery: 95, online: true, lastActivity: 'En reposo' },
        { id: 'zone_01', zone: 1, name: 'PIR Entrada', type: 'motion', status: 'clear', battery: 95, online: true, lastActivity: 'En reposo' }
      ];
    }
    console.log(`[TuyaIoT] Centralita ${alarmDev ? alarmDev.name : ''} lista. Modo de enlace por zonas de radiofrecuencia (433MHz) activo (${alarmState.sensors.length} zonas).`);
  }
}

// Decode binary accessories list from Tuya DP 'sub_admin'
function parseTuyaSubAdminSensors(rawBase64) {
  if (!rawBase64 || typeof rawBase64 !== 'string') return [];
  try {
    const buf = Buffer.from(rawBase64, 'base64');
    if (buf.length < 10) return [];

    const results = [];
    const count = buf[2] || 0;
    let ptr = 4;

    for (let idx = 0; idx < (count > 0 ? count : 30) && ptr < buf.length; idx++) {
      let found = false;
      for (let o = ptr; o < Math.min(ptr + 15, buf.length - 2); o++) {
        const len = buf.readUInt16LE(o);
        if (len >= 4 && len <= 120 && o + 2 + len <= buf.length + 1) {
          const textBuf = buf.slice(o + 2, o + 2 + len);
          let name = '';
          for (let c = 0; c < textBuf.length; c += 2) {
            const code = textBuf[c];
            if (code >= 32 && code <= 255) {
              name += String.fromCharCode(code);
            }
          }
          name = name.trim();
          if (name.length >= 2) {
            const zoneNum = idx + 1;
            const nameLower = name.toLowerCase();
            let type = 'door';
            if (nameLower.includes('puerta') || nameLower.includes('door') || nameLower.includes('entrada') || nameLower.includes('cocina')) {
              type = 'door';
            } else if (nameLower.includes('ventana') || nameLower.includes('window') || nameLower.includes('despacho')) {
              type = 'window';
            } else if (nameLower.includes('pir') || nameLower.includes('movimiento') || nameLower.includes('presencia') || nameLower.includes('motion')) {
              type = 'motion';
            }

            results.push({
              id: 'zone_' + String(zoneNum).padStart(2, '0'),
              zone: zoneNum,
              name,
              type,
              status: type === 'motion' ? 'clear' : 'closed',
              battery: 95,
              online: true,
              lastActivity: 'En reposo'
            });

            ptr = o + 2 + len;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        ptr++;
      }
    }
    return results;
  } catch (err) {
    console.warn('[TuyaIoT] Error parseando sub_admin:', err.message);
    return [];
  }
}

// Fetch real-time hardware status from Tuya IoT Platform
let lastIotSyncTime = 0;
async function tuyaIotSyncDeviceStatus(force = false) {
  if (!iotSession.isConnected || !alarmState.alarmDeviceId) return;
  // Rate-limit polling to Tuya IoT to at most once every 3 seconds unless forced
  if (!force && Date.now() - lastIotSyncTime < 3000) return;
  lastIotSyncTime = Date.now();

  try {
    await tuyaIotEnsureToken();
    const res = await tuyaIotRequest('GET', `/v1.0/devices/${alarmState.alarmDeviceId}/status`, null, iotSession.accessToken);
    if (res.data?.success && Array.isArray(res.data.result)) {
      const statusList = res.data.result;
      const getVal = (code) => statusList.find(s => s.code === code)?.value;

      const masterMode  = getVal('master_mode');
      const masterState = getVal('master_state');
      const chargeState = getVal('charge_state');
      const battery     = getVal('battery_percentage');
      const alarmMsg    = getVal('alarm_msg');
      const subAdmin    = getVal('sub_admin');

      if (masterMode) {
        if (masterMode === 'disarmed') {
          alarmState.mode = 'disarmed';
          alarmState.armed = false;
        } else if (masterMode === 'home') {
          alarmState.mode = 'armed_home';
          alarmState.armed = true;
        } else if (masterMode === 'arm') {
          alarmState.mode = 'armed_away';
          alarmState.armed = true;
        } else if (masterMode === 'sos') {
          alarmState.mode = 'triggered';
          alarmState.triggered = true;
          alarmState.siren = true;
        }
      }

      if (masterState === 'alarm') {
        alarmState.triggered = true;
        alarmState.siren = true;
      } else if (masterState === 'normal') {
        alarmState.triggered = false;
        alarmState.siren = false;
      }

      if (chargeState !== undefined) alarmState.acPower = Boolean(chargeState);
      if (typeof battery === 'number' && battery > 0) alarmState.battery = battery;

      // Synchronize sensors from Smart Life app via sub_admin DP
      if (subAdmin && typeof subAdmin === 'string') {
        const appSensors = parseTuyaSubAdminSensors(subAdmin);
        if (appSensors.length > 0) {
          const oldSensors = Array.isArray(alarmState.sensors) ? alarmState.sensors : [];
          // Merge statuses from old sensors into appSensors
          alarmState.sensors = appSensors.map(fresh => {
            const prev = oldSensors.find(o => 
              (o.name && fresh.name && o.name.toLowerCase() === fresh.name.toLowerCase()) ||
              o.id === fresh.id ||
              (o.zone && o.zone === fresh.zone)
            );
            let status = prev?.status || fresh.status;
            if ((fresh.type === 'door' || fresh.type === 'window') && (status === 'clear' || status === 'detected')) {
              status = status === 'detected' ? 'open' : 'closed';
            }
            return {
              ...fresh,
              status,
              battery: prev?.battery || fresh.battery,
              lastActivity: prev?.lastActivity || fresh.lastActivity
            };
          });
        }
      }

      // Filter out panel from sensors just in case
      if (Array.isArray(alarmState.sensors)) {
        alarmState.sensors = alarmState.sensors.filter(s => s.id !== alarmState.alarmDeviceId && !String(s.name || '').toLowerCase().includes('panel'));
      }

      if (alarmMsg && typeof alarmMsg === 'string') {
        try {
          const b = Buffer.from(alarmMsg, 'base64');
          const decoded = b.swap16().toString('utf16le').trim();
          if (decoded) {
            alarmState.lastAction = decoded.replace(/\n/g, ' ');
            alarmState.lastActionTime = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

            // Extract Zone number and custom name if present
            // e.g. "Puerta/Ventana Abierta\n (03 Zona)(Puerta cocina)"
            const zoneMatch = decoded.match(/\((\d+)\s*Zona\)/i) || decoded.match(/Zona\s*(\d+)/i);
            const nameMatch = decoded.match(/\(([^)]+)\)\s*$/);
            const isOpened = /abierta|abierto|disparo|alarma|intrusi[oó]n|movimiento/i.test(decoded);
            const isClosed = /cerrada|cerrado|restablecida|normal/i.test(decoded);

            if (zoneMatch) {
              const zoneNum = parseInt(zoneMatch[1], 10);
              const zoneStr = String(zoneNum).padStart(2, '0');
              const zoneName = nameMatch ? nameMatch[1].trim() : '';

              if (Array.isArray(alarmState.sensors)) {
                const cleanZoneName = zoneName ? zoneName.toLowerCase() : '';
                let sensor = alarmState.sensors.find(s => cleanZoneName && s.name.toLowerCase() === cleanZoneName)
                  || alarmState.sensors.find(s => cleanZoneName && (s.name.toLowerCase().includes(cleanZoneName) || cleanZoneName.includes(s.name.toLowerCase())))
                  || alarmState.sensors.find(s => (s.zone && parseInt(s.zone, 10) === zoneNum))
                  || alarmState.sensors.find(s => s.id === `zone_${zoneStr}`);

                if (!sensor) {
                  // Auto-create zone if not currently in sensor list
                  const detectedType = /ventana/i.test(decoded) ? 'window' : (/pir|movimiento/i.test(decoded) ? 'motion' : 'door');
                  sensor = {
                    id: `zone_${zoneStr}`,
                    zone: zoneNum,
                    name: zoneName || `Sensor Zona ${zoneStr}`,
                    type: detectedType,
                    status: isOpened ? (detectedType === 'motion' ? 'detected' : 'open') : 'closed',
                    battery: 95,
                    online: true,
                    lastActivity: `Activo ahora (${alarmState.lastActionTime})`
                  };
                  alarmState.sensors.push(sensor);
                }

                if (sensor) {
                  if (zoneName && (!sensor.name || sensor.name.startsWith('Sensor Zona'))) {
                    sensor.name = zoneName;
                  }
                  if (isOpened) {
                    sensor.status = sensor.type === 'motion' ? 'detected' : 'open';
                    sensor.lastActivity = `Abierto a las ${alarmState.lastActionTime}`;
                  } else if (isClosed) {
                    sensor.status = sensor.type === 'motion' ? 'clear' : 'closed';
                    sensor.lastActivity = `Cerrado a las ${alarmState.lastActionTime}`;
                  }
                }
              }
            }
          }
        } catch (e) {}
      }

      alarmState.connected = true;
    }
  } catch (err) {
    console.warn('[TuyaIoT] Error sincronizando estado del dispositivo:', err.message);
  }
}

function tuyaCloudRequest(hostname, reqPath, data, isJson = false) {
  return new Promise((resolve, reject) => {
    const postData = isJson ? JSON.stringify(data) : new URLSearchParams(data).toString();
    const options = {
      hostname: hostname || 'px1.tuyaeu.com',
      port: 443,
      path: reqPath,
      method: 'POST',
      headers: {
        'Content-Type': isJson ? 'application/json' : 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let responseText = '';
      res.on('data', chunk => { responseText += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseText || '{}');
          resolve({ statusCode: res.statusCode, data: parsed, raw: responseText });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: responseText, error: e.message });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tiempo de espera agotado conectando a Tuya Cloud'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

async function tuyaAuthenticate(email, password, countryCode = '34', bizType = 'smart_life') {
  const hosts = ['px1.tuyaeu.com', 'px1.tuyaus.com'];
  let lastErrMsg = null;

  for (const host of hosts) {
    console.log(`[Tuya/SmartLife] Intentando autenticar en ${host} (${bizType}, +${countryCode}, usuario: ${email})...`);
    try {
      const res = await tuyaCloudRequest(host, '/homeassistant/auth.do', {
        userName: email.trim(),
        password: password.trim(),
        countryCode: String(countryCode).trim(),
        bizType: bizType.trim(),
        from: 'tuya'
      }, false);

      if (res.data && res.data.responseStatus === 'ok' && res.data.access_token) {
        console.log(`[Tuya/SmartLife] ¡Autenticación exitosa en ${host}!`);
        return {
          host,
          accessToken: res.data.access_token,
          refreshToken: res.data.refresh_token,
          expiresIn: res.data.expires_in || 7200
        };
      }

      if (res.data && res.data.errorMsg) {
        const errMsg = res.data.errorMsg;
        console.warn(`[Tuya/SmartLife] Respuesta Tuya (${host}):`, errMsg);

        if (errMsg.includes('180 seconds') || errMsg.includes('exceed once')) {
          throw new Error('Tuya ha bloqueado temporalmente los intentos por seguridad (límite anti-spam de 180s). Espera 3 minutos antes de volver a intentar.');
        }

        lastErrMsg = errMsg;
        // If it was username or password error, maybe the account was registered on the other cloud region (EU vs US)
        if (errMsg.includes('Username or password error')) {
          continue;
        }
        throw new Error(errMsg);
      }
    } catch (err) {
      if (err.message.includes('180s') || err.message.includes('anti-spam')) {
        throw err;
      }
      lastErrMsg = err.message;
    }
  }

  if (lastErrMsg && lastErrMsg.includes('Username or password error')) {
    throw new Error('Usuario o contraseña no reconocidos en Tuya/Smart Life. Si entraste en la app mediante Google, debes fijar una contraseña en la app (Yo > ⚙️ Ajustes > Cuenta y seguridad > Contraseña).');
  }
  throw new Error(lastErrMsg || 'Respuesta no válida de los servidores de Tuya Cloud');
}

async function tuyaDiscoverDevices(host, accessToken) {
  try {
    const res = await tuyaCloudRequest(host || 'px1.tuyaeu.com', '/homeassistant/skill', {
      header: {
        name: 'Discovery',
        namespace: 'discovery',
        payloadVersion: '1'
      },
      payload: {
        accessToken
      }
    }, true);

    if (res.data && res.data.payload && Array.isArray(res.data.payload.devices)) {
      return res.data.payload.devices;
    }
    console.warn('[Tuya/SmartLife] Respuesta discovery sin array de dispositivos:', res.raw);
    return [];
  } catch (err) {
    console.error('[Tuya/SmartLife] Error en discovery:', err.message);
    return [];
  }
}

async function tuyaControlDevice(host, accessToken, devId, actionName, value) {
  try {
    console.log(`[Tuya/SmartLife] Enviando orden '${actionName}' (${value}) al dispositivo ${devId}...`);
    const res = await tuyaCloudRequest(host || 'px1.tuyaeu.com', '/homeassistant/skill', {
      header: {
        name: actionName || 'changeMode',
        namespace: 'control',
        payloadVersion: '1'
      },
      payload: {
        accessToken,
        devId,
        value
      }
    }, true);
    console.log('[Tuya/SmartLife] Resultado de control:', res.data || res.raw);
    return res.data;
  } catch (err) {
    console.error('[Tuya/SmartLife] Error enviando orden a Tuya:', err.message);
    return { error: err.message };
  }
}

// ── Alarm State & Synchronization ──
const DEFAULT_ALARM_SENSORS = [
  { id: 'zone_02', zone: 2, name: 'Puerta Principal', type: 'door', status: 'closed', battery: 95, online: true, lastActivity: 'En reposo' },
  { id: 'zone_03', zone: 3, name: 'Puerta Cocina', type: 'door', status: 'closed', battery: 95, online: true, lastActivity: 'En reposo' },
  { id: 'zone_04', zone: 4, name: 'Ventana Salón', type: 'window', status: 'closed', battery: 95, online: true, lastActivity: 'En reposo' },
  { id: 'zone_05', zone: 5, name: 'Ventana Dormitorio', type: 'window', status: 'closed', battery: 95, online: true, lastActivity: 'En reposo' },
  { id: 'zone_01', zone: 1, name: 'PIR Entrada', type: 'motion', status: 'clear', battery: 95, online: true, lastActivity: 'En reposo' }
];

const DEFAULT_ALARM_STATE = {
  connected: true,
  isRealTuya: false,
  realAccount: null,
  brand: 'Smart Life',
  model: 'Centralita Alarma WiFi (Tuya)',
  mode: 'disarmed', // 'disarmed', 'armed_home', 'armed_away', 'triggered'
  armed: false,
  triggered: false,
  triggeredSensor: null,
  siren: false,
  battery: 100,
  acPower: true,
  lastAction: 'Desarmada',
  lastActionTime: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  pinCode: '1234',
  pinRequired: true,
  alarmDeviceId: null,
  sensors: [...DEFAULT_ALARM_SENSORS],
  config: {
    cloudType: 'smartlife',
    clientId: '',
    clientSecret: '',
    deviceId: '',
    region: 'eu'
  }
};

let alarmState = { ...DEFAULT_ALARM_STATE };

function mapTuyaDevicesToAlarm(devices) {
  if (!Array.isArray(devices) || devices.length === 0) return;

  console.log(`[Tuya/SmartLife] Procesando ${devices.length} dispositivos descubiertos...`);
  
  // Look for alarm panel or hub
  let alarmDev = devices.find(d => {
    const t = (d.dev_type || d.ha_type || '').toLowerCase();
    const n = (d.name || '').toLowerCase();
    return t.includes('alarm') || n.includes('alarma') || n.includes('centralita') || n.includes('panel');
  });

  if (!alarmDev && devices.length > 0) {
    // If no explicit alarm named, use first device or hub
    alarmDev = devices[0];
  }

  if (alarmDev) {
    alarmState.alarmDeviceId = alarmDev.id;
    alarmState.model = alarmDev.name || 'Centralita Smart Life';
    tuyaSession.alarmDeviceId = alarmDev.id;
    console.log(`[Tuya/SmartLife] ★ Centralita/Dispositivo de alarma seleccionado: ${alarmDev.name} [${alarmDev.id}]`);
  }

  // Map sensor devices (door, window, PIR, contact sensors)
  const mappedSensors = [];
  devices.forEach((d, idx) => {
    const name = d.name || `Dispositivo ${idx + 1}`;
    const nameLower = name.toLowerCase();
    const typeLower = (d.dev_type || d.ha_type || '').toLowerCase();

    // Skip the central panel itself
    if (alarmDev && d.id === alarmDev.id) {
      return;
    }

    let sensorType = 'door';
    if (nameLower.includes('ventana') || typeLower.includes('window')) {
      sensorType = 'window';
    } else if (nameLower.includes('pir') || nameLower.includes('movimiento') || nameLower.includes('motion') || typeLower.includes('motion')) {
      sensorType = 'motion';
    }

    let status = 'closed';
    if (sensorType === 'motion') {
      status = (d.data?.state === 'true' || d.data?.state === true || d.data?.state === 'pir' || d.data?.state === 1) ? 'detected' : 'clear';
    } else {
      status = (d.data?.state === 'true' || d.data?.state === true || d.data?.state === 'open' || d.data?.state === 1) ? 'open' : 'closed';
    }

    mappedSensors.push({
      id: d.id,
      name,
      type: sensorType,
      status,
      battery: d.data?.battery || (d.data?.online === false ? 0 : 95),
      online: d.data?.online !== false,
      lastActivity: d.data?.online === false ? 'Offline' : 'En línea'
    });
  });

  if (mappedSensors.length > 0) {
    alarmState.sensors = mappedSensors;
    console.log(`[Tuya/SmartLife] ${mappedSensors.length} sensores vinculados.`);
  }
}

async function restoreAlarmSession() {
  // Check environment variables first (ideal for Render / Cloud deployments)
  const envClientId = process.env.TUYA_CLIENT_ID;
  const envClientSecret = process.env.TUYA_CLIENT_SECRET;
  const envUid = process.env.TUYA_UID;
  const envRegion = process.env.TUYA_REGION || 'eu';

  if (envClientId && envClientSecret) {
    console.log(`[TuyaIoT] Configurando Tuya IoT desde variables de entorno (${envClientId.slice(0, 8)}...)...`);
    iotSession.clientId = envClientId.trim();
    iotSession.clientSecret = envClientSecret.trim();
    iotSession.region = envRegion.trim();
    if (envUid) iotSession.uid = envUid.trim();

    try {
      await tuyaIotGetToken();
      if (iotSession.uid) {
        const devices = await tuyaIotGetDevices(iotSession.uid);
        mapIotDevicesToAlarm(devices);
      }
      await tuyaIotSyncDeviceStatus(true);
      iotSession.isConnected = true;
      alarmState.isRealTuya = true;
      alarmState.connected = true;
      alarmState.brand = 'Smart Life / IoT Platform';
      console.log(`[TuyaIoT] ¡Sesión de Tuya IoT Platform iniciada con éxito desde entorno!`);
      return;
    } catch (iotErr) {
      console.warn(`[TuyaIoT] Fallo al autenticar con variables de entorno: ${iotErr.message}`);
    }
  }

  if (fs.existsSync(ALARM_SESSION_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ALARM_SESSION_FILE, 'utf8'));
      if (data) {
        alarmState = { ...DEFAULT_ALARM_STATE, ...data };
        if (data.tuyaSession) {
          tuyaSession = { ...tuyaSession, ...data.tuyaSession };
        }
        if (data.iotSession) {
          iotSession = { ...iotSession, ...data.iotSession };
        }
        // Purge any panel instance from sensors
        if (alarmState.alarmDeviceId) {
          alarmState.sensors = (alarmState.sensors || []).filter(s => s.id !== alarmState.alarmDeviceId && !String(s.name || '').toLowerCase().includes('panel'));
        }
        if (!alarmState.sensors || alarmState.sensors.length === 0) {
          alarmState.sensors = [...DEFAULT_ALARM_SENSORS];
        }
        console.log(`[Alarma] Estado cargado desde archivo (isRealTuya: ${alarmState.isRealTuya}, ${alarmState.sensors.length} sensores)`);

        // If IoT credentials exist, re-authenticate with IoT Platform
        if (iotSession.clientId && iotSession.clientSecret) {
          console.log(`[TuyaIoT] Restaurando sesión de IoT Platform (${iotSession.clientId.slice(0, 8)}...)...`);
          try {
            await tuyaIotGetToken();
            if (iotSession.uid) {
              const devices = await tuyaIotGetDevices(iotSession.uid);
              mapIotDevicesToAlarm(devices);
            }
            iotSession.isConnected = true;
            alarmState.isRealTuya = true;
            alarmState.connected = true;
            alarmState.brand = 'Smart Life / IoT Platform';
            console.log(`[TuyaIoT] ¡Sesión de Tuya IoT Platform restaurada con éxito!`);
          } catch (iotErr) {
            console.warn(`[TuyaIoT] No se pudo renovar sesión IoT: ${iotErr.message}`);
          }
        } else if (tuyaSession.email && tuyaSession.password) {
          console.log(`[Tuya/SmartLife] Restaurando sesión de cuenta ${tuyaSession.email}...`);
          try {
            const authResult = await tuyaAuthenticate(
              tuyaSession.email,
              tuyaSession.password,
              tuyaSession.countryCode || '34',
              tuyaSession.bizType || 'smart_life'
            );
            tuyaSession.accessToken = authResult.accessToken;
            tuyaSession.refreshToken = authResult.refreshToken;
            tuyaSession.host = authResult.host;
            tuyaSession.expiresAt = Date.now() + (authResult.expiresIn * 1000);

            const devices = await tuyaDiscoverDevices(tuyaSession.host, tuyaSession.accessToken);
            mapTuyaDevicesToAlarm(devices);
            alarmState.isRealTuya = true;
            alarmState.realAccount = tuyaSession.email;
            alarmState.connected = true;
            alarmState.brand = 'Smart Life (Real)';
            saveAlarmSession();
            console.log(`[Tuya/SmartLife] ¡Sesión de alarma real restaurada con éxito!`);
          } catch (authErr) {
            console.warn(`[Tuya/SmartLife] No se pudo renovar sesión de Smart Life: ${authErr.message}`);
          }
        }
      }
    } catch (e) {
      console.warn('[Alarma] Error leyendo sesión guardada:', e.message);
    }
  }
}

function saveAlarmSession() {
  try {
    fs.writeFileSync(ALARM_SESSION_FILE, JSON.stringify({
      ...alarmState,
      tuyaSession,
      iotSession: {
        clientId: iotSession.clientId,
        clientSecret: iotSession.clientSecret,
        region: iotSession.region,
        uid: iotSession.uid
      }
    }, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Alarma] Error guardando sesión:', e.message);
  }
}

/* ── Try restoring Meross session on start ── */
function restoreSession() {
  // Check environment variables first (ideal for Render / Cloud deployments)
  const envEmail = process.env.MEROSS_EMAIL;
  const envPassword = process.env.MEROSS_PASSWORD;

  if (envEmail && envPassword) {
    console.log(`[Meross] Iniciando sesión desde variables de entorno para ${envEmail}...`);
    initMerossConnection({
      email: envEmail.trim(),
      password: envPassword.trim(),
      localHttpFirst: false
    }).catch(err => {
      console.warn('[Meross] Error conectando con credenciales de entorno:', err.message);
    });
    return;
  }

  if (fs.existsSync(SESSION_FILE)) {
    try {
      const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      if (session && session.email) {
        console.log(`[Meross] Restaurando sesión para ${session.email}...`);
        initMerossConnection({
          email: session.email,
          password: session.password,
          tokenData: session.tokenData,
          localHttpFirst: true
        }).catch(err => {
          console.warn('[Meross] Error restaurando sesión con token:', err.message);
        });
      }
    } catch (err) {
      console.warn('[Meross] No se pudo leer la sesión guardada:', err.message);
    }
  }
}

/* ── Initialize Meross Cloud Connection ── */
function initMerossConnection(options) {
  return new Promise((resolve, reject) => {
    if (merossClient) {
      try { merossClient.disconnectAll(true); } catch (e) {}
    }

    merossClient = new MerossCloud({
      ...options,
      logger: (msg) => console.log('[Meross Cloud]', msg)
    });

    merossClient.on('deviceInitialized', (deviceId, deviceDef, device) => {
      console.log(`[Meross] Dispositivo inicializado: ${deviceDef.devName} (${deviceDef.deviceType}) [${deviceId}]`);
      
      const type = (deviceDef.deviceType || '').toLowerCase();
      const name = (deviceDef.devName || '').toLowerCase();
      const isThermostat = type.includes('mts') || type.includes('thermostat') || name.includes('termostato') || name.includes('termo');

      if (isThermostat) {
        activeThermostat = { id: deviceId, def: deviceDef, device };
        console.log(`[Meross] ★ Termostato activo seleccionado: ${deviceDef.devName}`);
        setupThermostatListeners(device, deviceDef);
      }
    });

    merossClient.on('error', (err) => {
      console.error('[Meross] Error de cliente:', err);
    });

    merossClient.connect((err) => {
      if (err) {
        console.error('[Meross] Error conectando:', err);
        merossConnected = false;
        return reject(err);
      }

      merossConnected = true;
      console.log('[Meross] ¡Conexión con Meross Cloud establecida con éxito!');

      // Save token for session persistence
      try {
        const tokenData = merossClient.getTokenData();
        if (tokenData && options.email) {
          fs.writeFileSync(SESSION_FILE, JSON.stringify({
            email: options.email,
            password: options.password,
            tokenData,
            savedAt: new Date().toISOString()
          }, null, 2));
        }
      } catch (saveErr) {
        console.warn('[Meross] No se pudo guardar tokenData:', saveErr.message);
      }

      // Query devices
      merossClient.getDevices((devErr, count) => {
        if (devErr) {
          console.warn('[Meross] Error en getDevices:', devErr);
        } else {
          console.log(`[Meross] Dispositivos en cuenta: ${count || Object.keys(merossClient.devices || {}).length}`);
        }
        resolve({ success: true, count });
      });
    });
  });
}

/* ── Setup Thermostat Listeners & Polling ── */
function setupThermostatListeners(device, def) {
  if (!device) return;

  // Listen to PUSH events from Meross Cloud
  device.on('data', (namespace, payload) => {
    console.log(`[Meross] Telemetría Push '${namespace}':`, JSON.stringify(payload));
    parseThermostatPayload(payload, def);
  });

  // Query initial mode & telemetry
  queryThermostat(device, def);

  // Poll thermostat data every 30 seconds
  if (device._pollInterval) clearInterval(device._pollInterval);
  device._pollInterval = setInterval(() => {
    queryThermostat(device, def);
  }, 30000);
}

function queryThermostat(device, def) {
  if (typeof device.publishMessage !== 'function') return;

  device.publishMessage('GET', 'Appliance.Control.Thermostat.Mode', {}, (err, data) => {
    if (!err && data) {
      parseThermostatPayload(data, def);
    } else {
      // Fallback to System.All
      device.publishMessage('GET', 'Appliance.System.All', {}, (allErr, allData) => {
        if (!allErr && allData) {
          parseThermostatPayload(allData, def);
        }
      });
    }
  });
}

/* ── Parse thermostat readings ── */
function parseThermostatPayload(data, def) {
  try {
    const payload = data.payload || data;
    const modeList = payload.mode || payload.all?.digest?.thermostat?.mode;
    const modeData = Array.isArray(modeList) ? modeList[0] : modeList;

    if (modeData) {
      console.log('[Meross] RAW modeData received:', JSON.stringify(modeData));
      const rawCurrent = modeData.currentTemp ?? modeData.temperature ?? 210;
      const rawTarget = modeData.targetTemp ?? modeData.manualTemp ?? modeData.heatTemp ?? 210;
      
      // MTS200 values are ALWAYS reported in tenths of a degree (e.g. 55 = 5.5°C, 309 = 30.9°C)
      const currentTemp = Number(rawCurrent) / 10;
      const targetTemp = Number(rawTarget) / 10;
      const minTemp = modeData.min ? Number(modeData.min) / 10 : 5.0;
      const maxTemp = modeData.max ? Number(modeData.max) / 10 : 35.0;
      const ecoTemp = modeData.ecoTemp ? Number(modeData.ecoTemp) / 10 : 12.0;
      const heatTemp = modeData.heatTemp ? Number(modeData.heatTemp) / 10 : 26.0;
      const manualTemp = modeData.manualTemp ? Number(modeData.manualTemp) / 10 : targetTemp;
      const onoff = modeData.onoff !== undefined ? Boolean(modeData.onoff) : true;
      const isHeating = modeData.state === 1; // 1 = Heating active, 0 = Standby / Reached
      
      let mode = 'heat';
      if (modeData.mode === 0) mode = 'auto'; // 0 = Schedule / Programado
      else if (modeData.mode === 4) mode = 'heat'; // 4 = Manual
      else if (modeData.mode === 3) mode = 'eco'; // 3 = Eco
      else if (modeData.mode === 1) mode = 'cool'; // 1 = Cool / Verano
      else if (modeData.mode === 2) mode = 'eco';

      lastThermostatData = {
        connected: true,
        online: true,
        devName: def?.devName || activeThermostat?.def?.devName || 'Termostato',
        deviceType: def?.deviceType || activeThermostat?.def?.deviceType || 'mts200b',
        currentTemp: Math.round(currentTemp * 10) / 10,
        targetTemp: Math.round(targetTemp * 10) / 10,
        minTemp,
        maxTemp,
        ecoTemp,
        heatTemp,
        manualTemp,
        isHeating,
        state: modeData.state ?? 0,
        mode,
        modeNum: modeData.mode,
        onoff,
        lastUpdated: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };

      console.log('[Meross] ★ Telemetría actualizada del termostato:', lastThermostatData);
    }
  } catch (err) {
    console.warn('[Meross] Error parseando datos de termostato:', err);
  }
}

/* ── Helper to list discovered devices ── */
function getDeviceList() {
  if (!merossClient || !merossClient.devices) return [];
  return Object.values(merossClient.devices).map(d => ({
    id: d.dev?.uuid || d.uuid,
    name: d.dev?.devName || 'Dispositivo',
    type: d.dev?.deviceType || 'generic',
    online: d.dev?.onlineStatus === 1
  }));
}

/* ── HTTP Request Handler ── */
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Helper safe JSON sender
  const sendJson = (status, obj) => {
    if (res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  // -------------------------------------------------------------
  // API Endpoints
  // -------------------------------------------------------------

  // GET /api/meross/debug
  if (pathname === '/api/meross/debug' && req.method === 'GET') {
    if (!activeThermostat || !activeThermostat.device) {
      sendJson(200, { error: 'No active thermostat' });
      return;
    }
    const dev = activeThermostat.device;
    dev.publishMessage('GET', 'Appliance.System.Ability', {}, (err1, ability) => {
      dev.publishMessage('GET', 'Appliance.Control.Thermostat.Mode', {}, (err2, mode) => {
        sendJson(200, {
          ability: ability?.payload?.ability || {},
          mode: mode?.payload?.mode || mode?.payload || {},
          lastThermostatData
        });
      });
    });
    return;
  }

  // GET /api/meross/status
  if (pathname === '/api/meross/status' && req.method === 'GET') {
    const devices = getDeviceList();
    sendJson(200, {
      connected: merossConnected,
      hasSession: fs.existsSync(SESSION_FILE),
      devicesCount: devices.length,
      devices,
      thermostat: lastThermostatData || {
        connected: merossConnected,
        online: Boolean(activeThermostat),
        devName: activeThermostat?.def?.devName || (merossConnected ? 'Sincronizando...' : 'No conectado'),
        deviceType: activeThermostat?.def?.deviceType || 'mts200b',
        currentTemp: 21.5,
        targetTemp: 21.0,
        mode: 'heat',
        onoff: true,
        lastUpdated: null
      }
    });
    return;
  }

  // POST /api/meross/login
  if (pathname === '/api/meross/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { email, password, mfaCode } = payload;

        if (!email || !password) {
          sendJson(400, { error: 'Email y contraseña requeridos' });
          return;
        }

        console.log(`[Meross] Intentando iniciar sesión con ${email}...`);
        await initMerossConnection({
          email: email.trim(),
          password: password.trim(),
          mfaCode: mfaCode?.trim() || undefined,
          localHttpFirst: true
        });

        const devices = getDeviceList();
        sendJson(200, {
          success: true,
          message: 'Autenticación en Meross Cloud exitosa',
          devices
        });
      } catch (err) {
        console.error('[Meross] Error en login:', err.message);
        sendJson(401, {
          success: false,
          error: err.message || 'Error de autenticación con Meross'
        });
      }
    });
    return;
  }

  // POST /api/meross/thermostat (Control target temp / onoff / mode)
  if (pathname === '/api/meross/thermostat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { targetTemp, onoff, mode } = JSON.parse(body || '{}');

        // Resolve mode number for MTS200:
        // mode 0 = Schedule / Programado (Auto)
        // mode 4 = Manual (target setpoint)
        // mode 3 = Eco
        // mode 1 = Cool / Summer
        let modeNum = undefined;
        if (mode === 'auto' || mode === 0 || mode === 'schedule') {
          modeNum = 0; // Schedule / Programado
        } else if (mode === 'heat' || mode === 'manual' || mode === 4) {
          modeNum = 4; // Manual
        } else if (mode === 'eco' || mode === 3) {
          modeNum = 3; // Eco
        } else if (mode === 'cool' || mode === 1) {
          modeNum = 1; // Cool
        } else if (targetTemp !== undefined) {
          // Adjusting temperature manually switches the thermostat to Manual mode
          modeNum = 4;
        } else if (lastThermostatData?.modeNum !== undefined) {
          modeNum = lastThermostatData.modeNum;
        } else {
          modeNum = 4;
        }

        const modeStr = modeNum === 0 ? 'auto' : (modeNum === 3 ? 'eco' : (modeNum === 1 ? 'cool' : 'heat'));
        const safeTargetTemp = targetTemp !== undefined 
          ? Math.max(5.0, Math.min(35.0, Math.round(Number(targetTemp) * 10) / 10))
          : (lastThermostatData ? lastThermostatData.targetTemp : 21.0);
        const tempTenths = Math.round(safeTargetTemp * 10);

        if (!activeThermostat || !activeThermostat.device) {
          // If simulation, update local cache
          if (lastThermostatData) {
            if (targetTemp !== undefined) {
              lastThermostatData.targetTemp = safeTargetTemp;
              lastThermostatData.manualTemp = safeTargetTemp;
            }
            if (onoff !== undefined) lastThermostatData.onoff = Boolean(onoff);
            lastThermostatData.mode = modeStr;
            lastThermostatData.modeNum = modeNum;
          }
          sendJson(200, {
            success: true,
            simulated: true,
            thermostat: lastThermostatData
          });
          return;
        }

        const device = activeThermostat.device;
        const channel = 0;
        const effectiveOnoff = onoff !== undefined 
          ? (onoff ? 1 : 0) 
          : (lastThermostatData?.onoff ? 1 : 0);

        // MTS200 requires manualTemp and heatTemp in tenths of a degree
        const modeData = {
          channel,
          mode: modeNum,
          targetTemp: tempTenths,
          manualTemp: tempTenths,
          heatTemp: tempTenths,
          onoff: effectiveOnoff
        };

        if (modeNum === 1) {
          modeData.coolTemp = tempTenths;
        } else if (modeNum === 3 || modeNum === 2) {
          modeData.ecoTemp = tempTenths;
        }

        if (typeof device.controlThermostatMode === 'function') {
          device.controlThermostatMode(channel, modeData, (err, resp) => {
            if (err) {
              console.error('[Meross] Error controlando termostato:', err);
              sendJson(500, { error: err.message });
            } else {
              console.log('[Meross] Orden enviada al termostato con éxito:', modeData);
              if (lastThermostatData) {
                if (targetTemp !== undefined) lastThermostatData.targetTemp = safeTargetTemp;
                if (onoff !== undefined) lastThermostatData.onoff = Boolean(effectiveOnoff);
                lastThermostatData.mode = modeStr;
                lastThermostatData.modeNum = modeNum;
                lastThermostatData.lastUpdated = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              }
              sendJson(200, { success: true, thermostat: lastThermostatData });
            }
          });
        } else {
          sendJson(200, { success: true, thermostat: lastThermostatData });
        }
      } catch (err) {
        sendJson(400, { error: 'Petición inválida' });
      }
    });
    return;
  }

  // POST /api/meross/logout
  if (pathname === '/api/meross/logout' && req.method === 'POST') {
    if (fs.existsSync(SESSION_FILE)) {
      try { fs.unlinkSync(SESSION_FILE); } catch (e) {}
    }
    if (merossClient) {
      try { merossClient.disconnectAll(true); } catch (e) {}
      merossClient = null;
    }
    merossConnected = false;
    activeThermostat = null;
    lastThermostatData = null;
    sendJson(200, { success: true, message: 'Sesión cerrada' });
    return;
  }

  // =============================================================
  // ALARM API ENDPOINTS (Smart Life / Tuya)
  // =============================================================

  // GET /api/alarm/status
  if (pathname === '/api/alarm/status' && req.method === 'GET') {
    (async () => {
      if (iotSession.isConnected && alarmState.alarmDeviceId) {
        await tuyaIotSyncDeviceStatus();
      }
      sendJson(200, {
        success: true,
        alarm: {
          ...alarmState,
          hasPin: Boolean(alarmState.pinCode),
          pinRequired: alarmState.pinRequired,
          pinCode: undefined
        }
      });
    })();
    return;
  }

  // GET /api/alarm/tuya-inspect
  if (pathname === '/api/alarm/tuya-inspect' && req.method === 'GET') {
    (async () => {
      try {
        await tuyaIotEnsureToken();
        const devId = alarmState.alarmDeviceId;
        if (!devId) {
          sendJson(400, { success: false, error: 'No alarmDeviceId configured' });
          return;
        }
        const [specs, status, details, subDevices] = await Promise.all([
          tuyaIotRequest('GET', `/v1.0/devices/${devId}/specifications`, null, iotSession.accessToken),
          tuyaIotRequest('GET', `/v1.0/devices/${devId}/status`, null, iotSession.accessToken),
          tuyaIotRequest('GET', `/v1.0/devices/${devId}`, null, iotSession.accessToken),
          tuyaIotRequest('GET', `/v1.0/devices/${devId}/sub-devices`, null, iotSession.accessToken)
        ]);
        sendJson(200, {
          success: true,
          deviceId: devId,
          specs: specs.data,
          status: status.data,
          details: details.data,
          subDevices: subDevices.data
        });
      } catch (err) {
        sendJson(500, { success: false, error: err.message });
      }
    })();
    return;
  }

  // POST /api/alarm/login (Smart Life / Tuya Real Account Authentication)
  if (pathname === '/api/alarm/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { email, password, countryCode = '34', app = 'smart_life' } = JSON.parse(body || '{}');

        if (!email || !password) {
          sendJson(400, { success: false, error: 'Email y contraseña de Smart Life requeridos' });
          return;
        }

        console.log(`[Alarma] Conectando con cuenta real Smart Life/Tuya: ${email}...`);
        const bizType = app === 'tuya' ? 'tuya' : 'smart_life';

        const authResult = await tuyaAuthenticate(email, password, countryCode, bizType);
        tuyaSession = {
          email: email.trim(),
          password: password.trim(),
          countryCode: String(countryCode).trim(),
          bizType,
          host: authResult.host,
          accessToken: authResult.accessToken,
          refreshToken: authResult.refreshToken,
          expiresAt: Date.now() + (authResult.expiresIn * 1000),
          alarmDeviceId: null
        };

        const devices = await tuyaDiscoverDevices(tuyaSession.host, tuyaSession.accessToken);
        mapTuyaDevicesToAlarm(devices);

        alarmState.isRealTuya = true;
        alarmState.realAccount = email.trim();
        alarmState.connected = true;
        alarmState.brand = bizType === 'tuya' ? 'Tuya Smart (Real)' : 'Smart Life (Real)';
        alarmState.lastAction = 'Conectada a Smart Life';
        alarmState.lastActionTime = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        saveAlarmSession();

        sendJson(200, {
          success: true,
          message: `Cuenta ${alarmState.brand} conectada con éxito. ${devices.length} dispositivos encontrados.`,
          devicesCount: devices.length,
          devices,
          alarm: {
            ...alarmState,
            hasPin: Boolean(alarmState.pinCode),
            pinRequired: alarmState.pinRequired,
            pinCode: undefined
          }
        });
      } catch (err) {
        console.error('[Alarma] Error en login de Tuya/SmartLife:', err.message);
        sendJson(401, {
          success: false,
          error: err.message || 'Error de autenticación con Smart Life / Tuya'
        });
      }
    });
    return;
  }

  // POST /api/alarm/iot-login (Tuya IoT Platform — iot.tuya.com — Client ID + Secret)
  if (pathname === '/api/alarm/iot-login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { clientId, clientSecret, region = 'eu', uid } = JSON.parse(body || '{}');
        if (!clientId || !clientSecret) {
          sendJson(400, { success: false, error: 'Client ID y Client Secret requeridos' });
          return;
        }

        console.log(`[TuyaIoT] Autenticando con IoT Platform (region: ${region})...`);
        iotSession.clientId     = clientId.trim();
        iotSession.clientSecret = clientSecret.trim();
        iotSession.region       = region;
        if (uid && uid.trim()) {
          iotSession.uid = uid.trim();
        }

        // Get token — verifies credentials are correct
        await tuyaIotGetToken();
        console.log(`[TuyaIoT] Token obtenido. UID Desarrollador: ${iotSession.devUid}, UID App: ${iotSession.uid || '(no configurado)'}`);

        // Fetch devices for the linked user
        let devices = [];
        if (iotSession.uid) {
          devices = await tuyaIotGetDevices(iotSession.uid);
          mapIotDevicesToAlarm(devices);
        }

        iotSession.isConnected    = true;
        alarmState.isRealTuya     = true;
        alarmState.connected      = true;
        alarmState.brand          = 'Smart Life / IoT Platform';
        alarmState.realAccount    = `IoT:${clientId.slice(0, 8)}…`;
        alarmState.lastAction     = 'Conectada (Tuya IoT Platform)';
        alarmState.lastActionTime = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        // Persist
        saveAlarmSession();

        sendJson(200, {
          success: true,
          message: `Tuya IoT Platform conectado. ${devices.length} dispositivos encontrados.${iotSession.uid ? '' : ' Vincula tu cuenta Smart Life en iot.tuya.com > Devices > Link App Account para sincronizar tus sensores.'}`,
          devicesCount: devices.length,
          uid: iotSession.uid,
          needsUid: !iotSession.uid,
          alarm: {
            ...alarmState,
            hasPin: Boolean(alarmState.pinCode),
            pinRequired: alarmState.pinRequired,
            pinCode: undefined
          }
        });
      } catch (err) {
        console.error('[TuyaIoT] Error en iot-login:', err.message);
        iotSession.isConnected = false;
        let userMsg = err.message;
        if (userMsg.includes('sign') || userMsg.includes('token') || userMsg.includes('1010')) {
          userMsg = 'Client ID o Client Secret incorrecto. Comprueba tus credenciales en iot.tuya.com > Cloud > Tu proyecto > Overview.';
        }
        sendJson(401, { success: false, error: userMsg });
      }
    });
    return;
  }


  if (pathname === '/api/alarm/refresh' && req.method === 'POST') {
    (async () => {
      try {
        if (!alarmState.isRealTuya) {
          sendJson(200, { success: true, message: 'Modo local activo', alarm: alarmState });
          return;
        }

        // If connected via Tuya IoT Platform
        if (iotSession.isConnected && iotSession.clientId) {
          console.log('[TuyaIoT] Sincronizando dispositivos y zonas desde IoT Platform...');
          await tuyaIotEnsureToken();
          let devices = [];
          if (iotSession.uid) {
            devices = await tuyaIotGetDevices(iotSession.uid);
            mapIotDevicesToAlarm(devices);
          }
          // Force immediate status and sub_admin sensor accessories sync
          await tuyaIotSyncDeviceStatus(true);
          saveAlarmSession();
          sendJson(200, {
            success: true,
            message: `Dispositivos y zonas sincronizados con Smart Life (${alarmState.sensors.length} zonas activas)`,
            devicesCount: devices.length,
            uid: iotSession.uid,
            alarm: {
              ...alarmState,
              hasPin: Boolean(alarmState.pinCode),
              pinRequired: alarmState.pinRequired,
              pinCode: undefined
            }
          });
          return;
        }

        if (!tuyaSession.email) {
          sendJson(200, { success: true, message: 'Modo local activo', alarm: alarmState });
          return;
        }

        console.log('[Alarma] Sincronizando dispositivos desde Smart Life Cloud...');
        // Refresh token if needed
        if (!tuyaSession.accessToken || Date.now() >= tuyaSession.expiresAt) {
          const authResult = await tuyaAuthenticate(
            tuyaSession.email,
            tuyaSession.password,
            tuyaSession.countryCode,
            tuyaSession.bizType
          );
          tuyaSession.accessToken = authResult.accessToken;
          tuyaSession.refreshToken = authResult.refreshToken;
          tuyaSession.host = authResult.host;
          tuyaSession.expiresAt = Date.now() + (authResult.expiresIn * 1000);
        }

        const devices = await tuyaDiscoverDevices(tuyaSession.host, tuyaSession.accessToken);
        mapTuyaDevicesToAlarm(devices);
        saveAlarmSession();

        sendJson(200, {
          success: true,
          message: 'Dispositivos sincronizados con Smart Life',
          devicesCount: devices.length,
          alarm: {
            ...alarmState,
            hasPin: Boolean(alarmState.pinCode),
            pinRequired: alarmState.pinRequired,
            pinCode: undefined
          }
        });
      } catch (err) {
        console.warn('[Alarma] Error al sincronizar con Tuya Cloud:', err.message);
        sendJson(500, { success: false, error: err.message });
      }
    })();
    return;
  }

  // POST /api/alarm/logout (Unlink Smart Life account)
  if (pathname === '/api/alarm/logout' && req.method === 'POST') {
    try {
      tuyaSession = {
        email: null,
        password: null,
        countryCode: '34',
        bizType: 'smart_life',
        host: 'px1.tuyaeu.com',
        accessToken: null,
        refreshToken: null,
        expiresAt: 0,
        alarmDeviceId: null
      };

      iotSession = {
        clientId: null,
        clientSecret: null,
        region: 'eu',
        accessToken: null,
        refreshToken: null,
        uid: null,
        expiresAt: 0,
        isConnected: false
      };

      alarmState.isRealTuya = false;
      alarmState.realAccount = null;
      alarmState.brand = 'Smart Life';
      alarmState.model = 'Centralita Alarma WiFi (Tuya)';

      if (fs.existsSync(ALARM_SESSION_FILE)) {
        try { fs.unlinkSync(ALARM_SESSION_FILE); } catch (e) {}
      }

      saveAlarmSession();
      console.log('[Alarma] Cuenta Smart Life / IoT Platform desvinculada.');

      sendJson(200, {
        success: true,
        message: 'Cuenta Smart Life desvinculada correctamente',
        alarm: {
          ...alarmState,
          hasPin: Boolean(alarmState.pinCode),
          pinRequired: alarmState.pinRequired,
          pinCode: undefined
        }
      });
    } catch (err) {
      sendJson(500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/alarm/mode
  if (pathname === '/api/alarm/mode' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { mode, pin } = JSON.parse(body || '{}');
        if (!['disarmed', 'armed_home', 'armed_away'].includes(mode)) {
          sendJson(400, { success: false, error: 'Modo de alarma no válido' });
          return;
        }

        // Validate PIN when disarming
        if (mode === 'disarmed' && alarmState.pinRequired) {
          const storedPin = String(alarmState.pinCode || '1234').trim();
          const providedPin = String(pin || '').trim();
          if (storedPin !== '1234' && providedPin !== storedPin) {
            console.warn(`[Alarma] Intento de desarme con PIN incorrecto (${providedPin})`);
            sendJson(403, { success: false, error: 'Código PIN incorrecto' });
            return;
          }
          if (storedPin === '1234' && providedPin.length === 4) {
            alarmState.pinCode = providedPin; // Adopt the user's PIN
          }
        }

        // If connected to real Tuya device, forward real command
        if (alarmState.isRealTuya && alarmState.alarmDeviceId) {
          if (iotSession.isConnected && iotSession.clientId) {
            try {
              await tuyaIotControlAlarm(alarmState.alarmDeviceId, mode);
            } catch (controlErr) {
              console.warn(`[TuyaIoT] Fallo al enviar comando a IoT Platform: ${controlErr.message}`);
            }
          } else if (tuyaSession.accessToken) {
            const tuyaValue = mode === 'disarmed' ? 'disarm' : (mode === 'armed_home' ? 'home' : 'arm');
            try {
              console.log(`[Alarma] Transmitiendo cambio de modo '${tuyaValue}' a centralita física Tuya ${alarmState.alarmDeviceId}...`);
              await tuyaControlDevice(tuyaSession.host, tuyaSession.accessToken, alarmState.alarmDeviceId, 'changeMode', tuyaValue);
            } catch (controlErr) {
              console.warn(`[Alarma] Fallo al enviar cambio a Tuya Cloud: ${controlErr.message}`);
            }
          }
        }

        alarmState.mode = mode;
        alarmState.armed = mode !== 'disarmed';
        alarmState.triggered = false;
        alarmState.siren = false;
        alarmState.triggeredSensor = null;
        alarmState.lastAction = mode === 'disarmed' ? 'Desarmada' : (mode === 'armed_home' ? 'Armada en Casa (Noche)' : 'Armada Fuera');
        alarmState.lastActionTime = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        saveAlarmSession();
        console.log(`[Alarma] Modo actualizado a: ${mode}`);

        sendJson(200, {
          success: true,
          message: `Alarma ${alarmState.lastAction}`,
          alarm: {
            ...alarmState,
            hasPin: Boolean(alarmState.pinCode),
            pinRequired: alarmState.pinRequired,
            pinCode: undefined
          }
        });
      } catch (err) {
        sendJson(400, { success: false, error: 'Petición inválida' });
      }
    });
    return;
  }

  // POST /api/alarm/sos
  if (pathname === '/api/alarm/sos' && req.method === 'POST') {
    alarmState.mode = 'triggered';
    alarmState.triggered = true;
    alarmState.siren = true;
    alarmState.triggeredSensor = 'Botón de pánico SOS activado';
    alarmState.lastAction = '¡EMERGENCIA SOS DISPARADA!';
    alarmState.lastActionTime = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // Send SOS to real device if connected
    if (alarmState.isRealTuya && alarmState.alarmDeviceId) {
      if (iotSession.isConnected && iotSession.clientId) {
        try {
          tuyaIotControlAlarm(alarmState.alarmDeviceId, 'triggered');
        } catch (e) {}
      } else if (tuyaSession.accessToken) {
        try {
          tuyaControlDevice(tuyaSession.host, tuyaSession.accessToken, alarmState.alarmDeviceId, 'changeMode', 'sos');
        } catch (e) {}
      }
    }

    saveAlarmSession();
    console.warn(`[Alarma] ¡¡¡ALERTA SOS DISPARADA MANUALMENTE!!!`);

    sendJson(200, {
      success: true,
      message: 'Alerta SOS activada',
      alarm: {
        ...alarmState,
        hasPin: Boolean(alarmState.pinCode),
        pinRequired: alarmState.pinRequired,
        pinCode: undefined
      }
    });
    return;
  }

  // POST /api/alarm/sensor/toggle
  if (pathname === '/api/alarm/sensor/toggle' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { sensorId } = JSON.parse(body || '{}');
        const sensor = alarmState.sensors.find(s => s.id === sensorId);
        if (!sensor) {
          sendJson(404, { success: false, error: 'Sensor no encontrado' });
          return;
        }

        if (sensor.type === 'door' || sensor.type === 'window') {
          sensor.status = sensor.status === 'closed' ? 'open' : 'closed';
        } else if (sensor.type === 'motion') {
          sensor.status = sensor.status === 'clear' ? 'detected' : 'clear';
        }
        sensor.lastActivity = 'Ahora mismo';

        const isBreached = (sensor.type === 'motion' && sensor.status === 'detected') ||
                           ((sensor.type === 'door' || sensor.type === 'window') && sensor.status === 'open');

        // Trigger alarm if armed and breached
        if (alarmState.armed && isBreached) {
          if (alarmState.mode === 'armed_away' || (alarmState.mode === 'armed_home' && sensor.type !== 'motion')) {
            alarmState.mode = 'triggered';
            alarmState.triggered = true;
            alarmState.siren = true;
            alarmState.triggeredSensor = `${sensor.name} (${sensor.status === 'open' ? 'Abierta' : 'Movimiento detectado'})`;
            alarmState.lastAction = `¡Disparada por ${sensor.name}!`;
            alarmState.lastActionTime = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            console.warn(`[Alarma] ¡¡Disparo activado por ${alarmState.triggeredSensor}!!`);
          }
        }

        saveAlarmSession();
        sendJson(200, {
          success: true,
          sensor,
          alarm: {
            ...alarmState,
            hasPin: Boolean(alarmState.pinCode),
            pinRequired: alarmState.pinRequired,
            pinCode: undefined
          }
        });
      } catch (err) {
        sendJson(400, { success: false, error: 'Petición inválida' });
      }
    });
    return;
  }

  // POST /api/alarm/config
  if (pathname === '/api/alarm/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { pinCode, pinRequired, config } = JSON.parse(body || '{}');
        if (pinCode !== undefined && String(pinCode).trim().length === 4) {
          alarmState.pinCode = String(pinCode).trim();
          console.log(`[Alarma] Nuevo código PIN configurado`);
        }
        if (pinRequired !== undefined) {
          alarmState.pinRequired = Boolean(pinRequired);
        }
        if (config) {
          alarmState.config = { ...alarmState.config, ...config };
        }

        saveAlarmSession();
        sendJson(200, {
          success: true,
          message: 'Ajustes de alarma actualizados',
          alarm: {
            ...alarmState,
            hasPin: Boolean(alarmState.pinCode),
            pinRequired: alarmState.pinRequired,
            pinCode: undefined
          }
        });
      } catch (err) {
        sendJson(400, { success: false, error: 'Petición inválida' });
      }
    });
    return;
  }

  // POST /api/alarm/sensors (Save / customize sensors and RF zones)
  if (pathname === '/api/alarm/sensors' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { sensors } = JSON.parse(body || '{}');
        if (Array.isArray(sensors)) {
          // Sanitize sensors to prevent panel from being added as a sensor
          alarmState.sensors = sensors
            .filter(s => s && s.id !== alarmState.alarmDeviceId && !String(s.name || '').toLowerCase().includes('panel'))
            .map((s, idx) => ({
              id: s.id || `zone_${String(s.zone || idx + 1).padStart(2, '0')}`,
              zone: s.zone !== undefined ? parseInt(s.zone, 10) : (idx + 1),
              name: String(s.name || `Sensor Zona ${idx + 1}`).trim(),
              type: ['door', 'window', 'motion'].includes(s.type) ? s.type : 'door',
              status: s.status || (s.type === 'motion' ? 'clear' : 'closed'),
              battery: typeof s.battery === 'number' ? s.battery : 95,
              online: s.online !== false,
              lastActivity: s.lastActivity || 'Configurado'
            }));
          saveAlarmSession();
          console.log(`[Alarma] Actualizadas ${alarmState.sensors.length} zonas de sensores.`);
        }
        sendJson(200, {
          success: true,
          message: 'Zonas de sensores actualizadas correctamente',
          sensors: alarmState.sensors,
          alarm: {
            ...alarmState,
            hasPin: Boolean(alarmState.pinCode),
            pinRequired: alarmState.pinRequired,
            pinCode: undefined
          }
        });
      } catch (err) {
        sendJson(400, { success: false, error: 'Datos de sensores no válidos' });
      }
    });
    return;
  }

  // =============================================================
  // CAMERA API ENDPOINTS (TP-Link Tapo C230 / RTSP)
  // =============================================================

  // GET /api/camera/status
  if (pathname === '/api/camera/status' && req.method === 'GET') {
    sendJson(200, {
      success: true,
      camera: {
        ...cameraState,
        hasPassword: Boolean(cameraState.password),
        password: cameraState.password ? '••••••••' : ''
      }
    });
    return;
  }

  // POST /api/camera/toggle
  if (pathname === '/api/camera/toggle' && req.method === 'POST') {
    cameraState.on = !cameraState.on;
    cameraState.lastActivity = cameraState.on ? 'En línea' : 'En espera';
    saveCameraSession();
    sendJson(200, {
      success: true,
      camera: {
        ...cameraState,
        hasPassword: Boolean(cameraState.password),
        password: cameraState.password ? '••••••••' : ''
      }
    });
    return;
  }

  // POST /api/camera/config
  if (pathname === '/api/camera/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { ip, username, password, model, on } = JSON.parse(body || '{}');
        if (ip) cameraState.ip = String(ip).trim();
        if (username) cameraState.username = String(username).trim();
        if (password && password !== '••••••••') cameraState.password = String(password).trim();
        if (model) cameraState.model = String(model).trim();
        if (typeof on === 'boolean') cameraState.on = on;
        cameraState.connected = Boolean(cameraState.ip && cameraState.username && cameraState.password);
        cameraState.lastActivity = 'Configurada';
        saveCameraSession();
        sendJson(200, {
          success: true,
          message: 'Ajustes de cámara guardados con éxito',
          camera: {
            ...cameraState,
            hasPassword: Boolean(cameraState.password),
            password: cameraState.password ? '••••••••' : ''
          }
        });
      } catch (err) {
        sendJson(400, { success: false, error: 'Petición de cámara inválida' });
      }
    });
    return;
  }

  // GET /api/camera/snapshot
  if (pathname === '/api/camera/snapshot' && req.method === 'GET') {
    if (!cameraState.connected || !cameraState.ip || !cameraState.username || !cameraState.password || !cameraState.on) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Cámara desactivada o no configurada');
      return;
    }

    const isHd = parsedUrl.query?.hd === '1' || parsedUrl.query?.hd === 'true';
    const streamName = isHd ? (cameraState.hdStream || 'stream1') : (cameraState.stream || 'stream2');
    const rtspUrl = `rtsp://${cameraState.username}:${cameraState.password}@${cameraState.ip}:${cameraState.port || 554}/${streamName}`;

    if (!isHd && lastCameraFrame && (Date.now() - lastCameraFrameTime < 1200)) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Length': lastCameraFrame.length
      });
      res.end(lastCameraFrame);
      return;
    }

    const ff = spawn('ffmpeg', [
      '-y',
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-vframes', '1',
      '-f', 'image2',
      '-vcodec', 'mjpeg',
      '-q:v', isHd ? '3' : '5',
      'pipe:1'
    ]);

    const chunks = [];
    ff.stdout.on('data', chunk => chunks.push(chunk));
    ff.on('close', code => {
      if (code === 0 && chunks.length > 0) {
        const fullBuf = Buffer.concat(chunks);
        if (!isHd) {
          lastCameraFrame = fullBuf;
          lastCameraFrameTime = Date.now();
        }
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Length': fullBuf.length
        });
        res.end(fullBuf);
      } else {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error capturando fotograma de la cámara');
        }
      }
    });

    ff.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error al ejecutar ffmpeg');
      }
    });
    return;
  }

  // GET /api/camera/stream (Live MJPEG Stream)
  if (pathname === '/api/camera/stream' && req.method === 'GET') {
    if (!cameraState.connected || !cameraState.ip || !cameraState.username || !cameraState.password || !cameraState.on) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Cámara desactivada o no configurada');
      return;
    }

    const isHd = parsedUrl.query?.hd === '1' || parsedUrl.query?.hd === 'true';
    const streamName = isHd ? (cameraState.hdStream || 'stream1') : (cameraState.stream || 'stream2');
    const rtspUrl = `rtsp://${cameraState.username}:${cameraState.password}@${cameraState.ip}:${cameraState.port || 554}/${streamName}`;
    const boundary = 'ffserver';

    res.writeHead(200, {
      'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'close'
    });

    const fps = isHd ? '2' : '4';
    const ff = spawn('ffmpeg', [
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', isHd ? '3' : '5',
      '-r', fps,
      'pipe:1'
    ]);

    let frameBuffer = Buffer.alloc(0);

    ff.stdout.on('data', chunk => {
      frameBuffer = Buffer.concat([frameBuffer, chunk]);
      while (true) {
        const start = frameBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
        if (start === -1) break;
        const end = frameBuffer.indexOf(Buffer.from([0xFF, 0xD9]), start + 2);
        if (end === -1) break;

        const jpeg = frameBuffer.slice(start, end + 2);
        frameBuffer = frameBuffer.slice(end + 2);

        if (!isHd) {
          lastCameraFrame = jpeg;
          lastCameraFrameTime = Date.now();
        }

        try {
          res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
          res.write(jpeg);
          res.write('\r\n');
        } catch (e) {
          try { ff.kill(); } catch(err){}
          break;
        }
      }
    });

    ff.on('error', () => { try { ff.kill(); } catch(e){} });
    req.on('close', () => { try { ff.kill(); } catch(e){} });
    res.on('close', () => { try { ff.kill(); } catch(e){} });
    return;
  }

  // -------------------------------------------------------------
  // Static File Serving
  // -------------------------------------------------------------
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Acceso denegado');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(__dirname, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error interno del servidor');
        }
      } else {
        if (!res.headersSent) {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      }
    });
  });
});

// Start listening on all interfaces (IPv4 and IPv6)
server.listen(PORT, () => {
  console.log(`\n============================================================`);
  console.log(`  🏠 SmartHome Server ejecutándose en:`);
  console.log(`  - Local:   http://localhost:${PORT}`);
  console.log(`  - En red:  http://192.168.1.140:${PORT}`);
  console.log(`============================================================\n`);
  
  // Restore sessions
  restoreSession();
  restoreAlarmSession();
  restoreCameraSession();
});
