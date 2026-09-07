/* ============================================================
   ROUTER — SmartHome Dashboard
   Hash-based SPA router with page transitions
   ============================================================ */

class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.container = null;
    this._onRouteChange = null;
  }

  init(containerId) {
    this.container = document.getElementById(containerId);
    window.addEventListener('hashchange', () => this._handleRoute());
    // Handle initial route
    this._handleRoute();
  }

  register(path, pageFactory) {
    this.routes.set(path, pageFactory);
  }

  navigate(path) {
    window.location.hash = path;
  }

  onRouteChange(callback) {
    this._onRouteChange = callback;
  }

  _handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const pageFactory = this.routes.get(hash);

    if (!pageFactory) {
      // Default to home
      this.navigate('/');
      return;
    }

    if (this.currentRoute === hash) return;

    const prevRoute = this.currentRoute;
    this.currentRoute = hash;

    // Render page
    if (this.container) {
      this.container.innerHTML = '';
      const page = document.createElement('div');
      page.className = 'page-enter';
      page.innerHTML = pageFactory();
      this.container.appendChild(page);

      // Notify listeners
      if (this._onRouteChange) {
        this._onRouteChange(hash, prevRoute);
      }
    }
  }

  getCurrentRoute() {
    return this.currentRoute;
  }
}

const router = new Router();
export default router;
