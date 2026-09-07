/* ============================================================
   STORAGE SERVICE — SmartHome Dashboard
   LocalStorage persistence layer
   ============================================================ */

const StorageService = {
  PREFIX: 'smarthome_',

  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      return raw !== null ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    localStorage.removeItem(this.PREFIX + key);
  },

  clear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(this.PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }
};

export default StorageService;
