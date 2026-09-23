import { PLAN_WEATHER_FALLBACK } from '../db/seedData';

export const WEATHER_TIMEOUT_MS = 3000;
export const FORECAST_HOURS = 72;
export const DAYTIME_START_HOUR = 10;
export const DAYTIME_END_HOUR = 17;
export const WEATHER_BASIS = 'forecast_72h_daytime_avg' as const;
export const WEATHER_TIMEZONE = 'Asia/Bangkok';

export interface WeatherReading {
  tempC: number;
  humidity: number;
  fallback: boolean;
  basis: typeof WEATHER_BASIS;
}

interface HourlyPayload {
  time?: unknown;
  temperature_2m?: unknown;
  relative_humidity_2m?: unknown;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Parse local hour from Open-Meteo time string such as 2026-09-23T14:00. */
export function localHourFromForecastTime(isoLocal: string): number {
  const match = /T(\d{2})/.exec(isoLocal);
  if (match === null) {
    throw new Error(`Open-Meteo time missing hour: ${isoLocal}`);
  }
  return Number(match[1]);
}

/** Average temperature and humidity for local hours 10:00–17:00 inclusive. */
export function averageDaytimeForecast(
  times: string[],
  temperatures: number[],
  humidities: number[],
): { tempC: number; humidity: number } {
  if (times.length === 0 || times.length !== temperatures.length || times.length !== humidities.length) {
    throw new Error('Open-Meteo hourly arrays mismatch');
  }
  let tempSum = 0;
  let humiditySum = 0;
  let count = 0;
  for (let index = 0; index < times.length; index += 1) {
    const hour = localHourFromForecastTime(times[index] ?? '');
    if (hour < DAYTIME_START_HOUR || hour > DAYTIME_END_HOUR) {
      continue;
    }
    const tempC = temperatures[index];
    const humidity = humidities[index];
    if (typeof tempC !== 'number' || typeof humidity !== 'number') {
      throw new Error('Open-Meteo daytime sample is not numeric');
    }
    tempSum += tempC;
    humiditySum += humidity;
    count += 1;
  }
  if (count === 0) {
    throw new Error('Open-Meteo daytime hours missing');
  }
  return { tempC: round1(tempSum / count), humidity: round1(humiditySum / count) };
}

function asNumberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'number')) {
    throw new Error(`Open-Meteo payload missing ${label}`);
  }
  return value as number[];
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Open-Meteo payload missing ${label}`);
  }
  return value as string[];
}

export async function fetchWeather(lat: number, lng: number): Promise<WeatherReading> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m');
    url.searchParams.set('forecast_hours', String(FORECAST_HOURS));
    url.searchParams.set('timezone', WEATHER_TIMEZONE);
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Open-Meteo status ${response.status}`);
    }
    const body = (await response.json()) as { hourly?: HourlyPayload };
    const hourly = body.hourly;
    if (hourly === undefined) {
      throw new Error('Open-Meteo payload missing hourly');
    }
    const average = averageDaytimeForecast(
      asStringArray(hourly.time, 'hourly.time'),
      asNumberArray(hourly.temperature_2m, 'hourly.temperature_2m'),
      asNumberArray(hourly.relative_humidity_2m, 'hourly.relative_humidity_2m'),
    );
    return { ...average, fallback: false, basis: WEATHER_BASIS };
  } catch (error) {
    console.warn('Open-Meteo unavailable, using fallback 32°C / 75%', error);
    return {
      tempC: PLAN_WEATHER_FALLBACK.tempC,
      humidity: PLAN_WEATHER_FALLBACK.humidity,
      fallback: true,
      basis: WEATHER_BASIS,
    };
  } finally {
    clearTimeout(timer);
  }
}
