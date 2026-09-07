/* ============================================================
   WEATHER SERVICE — SmartHome Dashboard
   Real weather data integration via Open-Meteo (No API key needed)
   ============================================================ */

import state from '../state.js';

// WMO Weather Interpretation Codes (WW)
const WMO_CODES = {
  0: { label: 'Despejado', icon: '☀️' },
  1: { label: 'Mayormente despejado', icon: '🌤️' },
  2: { label: 'Parcialmente nublado', icon: '⛅' },
  3: { label: 'Nublado', icon: '☁️' },
  45: { label: 'Niebla', icon: '🌫️' },
  48: { label: 'Niebla con escarcha', icon: '🌫️' },
  51: { label: 'Llovizna ligera', icon: '🌦️' },
  53: { label: 'Llovizna moderada', icon: '🌦️' },
  55: { label: 'Llovizna densa', icon: '🌧️' },
  61: { label: 'Lluvia ligera', icon: '🌧️' },
  63: { label: 'Lluvia moderada', icon: '🌧️' },
  65: { label: 'Lluvia fuerte', icon: '🌧️' },
  71: { label: 'Nevada ligera', icon: '🌨️' },
  73: { label: 'Nevada moderada', icon: '❄️' },
  75: { label: 'Nevada intensa', icon: '❄️' },
  80: { label: 'Chubascos leves', icon: '🌦️' },
  81: { label: 'Chubascos moderados', icon: '🌧️' },
  82: { label: 'Chubascos violentos', icon: '⛈️' },
  95: { label: 'Tormenta eléctrica', icon: '⛈️' },
  96: { label: 'Tormenta con granizo leve', icon: '⛈️' },
  99: { label: 'Tormenta con granizo fuerte', icon: '⛈️' }
};

class WeatherService {
  constructor() {
    this.refreshIntervalMs = 15 * 60 * 1000; // 15 minutes
    this.timerId = null;
    this.isFetching = false;
  }

  /* ── Initialize service: load cached + fetch fresh ── */
  init() {
    // Initial fetch
    this.fetchCurrentWeather().catch(err => {
      console.warn('[WeatherService] Initial fetch failed, using cached/default:', err);
    });

    // Setup periodic auto-refresh
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => {
      this.fetchCurrentWeather().catch(() => {});
    }, this.refreshIntervalMs);
  }

  /* ── Geocode a city name into lat/lon ── */
  async searchCity(cityName) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=es&format=json`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      if (!data.results || data.results.length === 0) {
        throw new Error(`Ciudad "${cityName}" no encontrada`);
      }
      const top = data.results[0];
      return {
        city: top.name,
        country: top.country,
        admin1: top.admin1,
        lat: top.latitude,
        lon: top.longitude
      };
    } catch (error) {
      console.error('[WeatherService] Error geocodificando ciudad:', error);
      throw error;
    }
  }

  /* ── Try GPS geolocation if available ── */
  async getDeviceCoordinates() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        return reject(new Error('Geolocalización no soportada'));
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        err => reject(err),
        { timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  /* ── Fetch current weather from Open-Meteo ── */
  async fetchCurrentWeather(forcedCity = null) {
    if (this.isFetching) return state.get('home.weather');
    this.isFetching = true;

    try {
      let lat = 40.4168; // Default Madrid
      let lon = -3.7038;
      let cityName = forcedCity || state.get('home.weather.city') || 'Madrid';

      // If user specified a city or city is saved, resolve coordinates
      try {
        const geo = await this.searchCity(cityName);
        lat = geo.lat;
        lon = geo.lon;
        cityName = geo.city;
      } catch {
        // Fallback default coordinates
      }

      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
      const response = await fetch(weatherUrl);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const data = await response.json();
      const current = data.current;
      const codeInfo = WMO_CODES[current.weather_code] || { label: 'Despejado', icon: '☀️' };

      const weatherData = {
        temp: Math.round(current.temperature_2m),
        feelsLike: Math.round(current.apparent_temperature),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        condition: codeInfo.label,
        icon: codeInfo.icon,
        city: cityName,
        isReal: true,
        lastUpdated: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      };

      // Save to reactive state
      state.set('home.weather', weatherData);
      console.log('[WeatherService] Clima real actualizado con éxito:', weatherData);

      // Dynamically update UI if elements exist
      this.updateWeatherDOM(weatherData);

      return weatherData;
    } catch (error) {
      console.error('[WeatherService] Error al obtener clima real:', error);
      throw error;
    } finally {
      this.isFetching = false;
    }
  }

  /* ── Update active DOM elements without re-rendering entire page ── */
  updateWeatherDOM(weather) {
    if (typeof document === 'undefined') return;
    const banner = document.getElementById('weather-banner');
    if (!banner) return;

    const tempEl = banner.querySelector('.weather-banner__temp');
    if (tempEl) tempEl.textContent = `${weather.icon} ${weather.temp}° en ${weather.city}`;

    const detailsEl = banner.querySelector('.weather-banner__details');
    if (detailsEl) {
      detailsEl.textContent = `Sensación ${weather.feelsLike}° · Humedad ${weather.humidity}% · Viento ${weather.windSpeed} km/h · ${weather.condition}`;
    }

    const iconEl = banner.querySelector('.weather-banner__icon');
    if (iconEl) iconEl.textContent = weather.icon;

    const badgeEl = banner.querySelector('.weather-banner__badge');
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="pulse-dot pulse-dot--active" style="width:6px;height:6px;"></span> En vivo (${weather.lastUpdated})`;
    }
  }
}

const weatherService = new WeatherService();
export default weatherService;
