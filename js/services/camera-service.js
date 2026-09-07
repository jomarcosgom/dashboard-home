/* ============================================================
   CAMERA SERVICE — SmartHome Dashboard
   Real-time video streaming & controls for TP-Link Tapo C230
   ============================================================ */

class CameraService {
  constructor() {
    this._status = null;
  }

  async getStatus() {
    try {
      const res = await fetch('/api/camera/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this._status = data.camera;
          return data.camera;
        }
      }
    } catch (e) {
      console.warn('[CameraService] Error fetching camera status:', e.message);
    }
    return this._status || { on: true, connected: false, model: 'Tapo C230' };
  }

  async toggle() {
    try {
      const res = await fetch('/api/camera/toggle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this._status = data.camera;
          return data.camera;
        }
      }
    } catch (e) {
      console.warn('[CameraService] Error toggling camera:', e.message);
    }
    return null;
  }

  async saveConfig(cfg) {
    try {
      const res = await fetch('/api/camera/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this._status = data.camera;
          return { success: true, camera: data.camera };
        }
        return { success: false, error: data.error || 'Error guardando ajustes' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
    return { success: false, error: 'Error guardando ajustes' };
  }

  getStreamUrl(hd = false) {
    return `/api/camera/stream${hd ? '?hd=1' : ''}`;
  }

  getSnapshotUrl(hd = false) {
    return `/api/camera/snapshot${hd ? '?hd=1' : ''}&t=${Date.now()}`;
  }
}

export const cameraService = new CameraService();
export default cameraService;
