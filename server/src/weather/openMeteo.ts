import { PLAN_WEATHER_FALLBACK } from '../db/seedData';

export const WEATHER_TIMEOUT_MS = 3000;

export interface WeatherReading {
  tempC: number;
  humidity: number;
  fallback: boolean;
}

export async function fetchWeather(lat: number, lng: number): Promise<WeatherReading> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m');
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Open-Meteo status ${response.status}`);
    }
    const body = (await response.json()) as {
      current?: { temperature_2m?: unknown; relative_humidity_2m?: unknown };
    };
    const tempC = body.current?.temperature_2m;
    const humidity = body.current?.relative_humidity_2m;
    if (typeof tempC !== 'number' || typeof humidity !== 'number') {
      throw new Error('Open-Meteo payload missing current weather');
    }
    return { tempC, humidity, fallback: false };
  } catch (error) {
    console.warn('Open-Meteo unavailable, using fallback 32°C / 75%', error);
    return {
      tempC: PLAN_WEATHER_FALLBACK.tempC,
      humidity: PLAN_WEATHER_FALLBACK.humidity,
      fallback: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
