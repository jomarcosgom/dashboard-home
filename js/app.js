/* ============================================================
   APP — SmartHome Dashboard
   Main entry point: initializes router, navigation, and pages
   ============================================================ */

import router from './router.js';
import Icons from './icons.js';
import { renderDashboard, initDashboard } from './pages/dashboard.js';
import { renderLights, initLights } from './pages/lights.js';
import { renderClimate, initClimate } from './pages/climate.js';
import { renderSecurity, initSecurity } from './pages/security.js';
import { renderSettings, initSettings } from './pages/settings.js';
import weatherService from './services/weather-service.js';
import alarmService from './services/alarm-service.js';

/* ── Page initializers map ── */
const pageInits = {
  '/': initDashboard,
  '/lights': initLights,
  '/climate': initClimate,
  '/security': initSecurity,
  '/settings': initSettings
};

/* ── Register routes ── */
router.register('/', renderDashboard);
router.register('/lights', renderLights);
router.register('/climate', renderClimate);
router.register('/security', renderSecurity);
router.register('/settings', renderSettings);

/* ── On route change: update nav + init page ── */
router.onRouteChange((route, prevRoute) => {
  // If leaving security page, pause alarm polling
  if (prevRoute === '/security' && route !== '/security') {
    alarmService.stopPolling();
  }

  // Update active nav item
  document.querySelectorAll('.bottom-nav__item').forEach(item => {
    const href = item.getAttribute('href');
    const isActive = href === `#${route}`;
    item.classList.toggle('bottom-nav__item--active', isActive);
  });

  // Initialize page-specific event listeners
  requestAnimationFrame(() => {
    const init = pageInits[route];
    if (init) init();
  });
});

/* ── Init app ── */
document.addEventListener('DOMContentLoaded', () => {
  // Build navigation
  buildNav();

  // Start router
  router.init('page-content');

  // Register service worker
  registerSW();

  // PWA install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window._deferredInstallPrompt = e;
  });

  // Update time display
  updateClock();
  setInterval(updateClock, 60000);

  // Initialize real weather service
  weatherService.init();
});

/* ── Build Bottom Navigation ── */
function buildNav() {
  const nav = document.getElementById('bottom-nav');
  if (!nav) return;

  const items = [
    { path: '/', icon: Icons.home, label: 'Inicio' },
    { path: '/lights', icon: Icons.lightbulb, label: 'Luces' },
    { path: '/climate', icon: Icons.thermometer, label: 'Clima' },
    { path: '/security', icon: Icons.shield, label: 'Seguridad' },
    { path: '/settings', icon: Icons.settings, label: 'Ajustes' }
  ];

  nav.innerHTML = items.map(item => `
    <a href="#${item.path}" class="bottom-nav__item" aria-label="${item.label}">
      ${item.icon}
      <span>${item.label}</span>
    </a>
  `).join('');
}

/* ── Update Clock ── */
function updateClock() {
  const el = document.getElementById('topbar-time');
  if (el) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    el.textContent = `${timeStr} · ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}`;
  }
}

/* ── Register Service Worker ── */
async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      // SW registration failed silently
    }
  }
}
