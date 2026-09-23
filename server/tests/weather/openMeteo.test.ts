import { PLAN_WEATHER_FALLBACK } from '../../src/db/seedData';
import {
  averageDaytimeForecast,
  fetchWeather,
  FORECAST_HOURS,
  WEATHER_BASIS,
  WEATHER_TIMEOUT_MS,
  WEATHER_TIMEZONE,
} from '../../src/weather/openMeteo';
import { buildHourlyForecastMock, installWeatherSuccess } from '../weatherMock';

describe('Open-Meteo client', () => {
  afterEach(() => {
    jest.useRealTimers();
    installWeatherSuccess();
  });

  it('averages only Bangkok daytime hours 10:00–17:00', () => {
    const payload = buildHourlyForecastMock(34, 78);
    const average = averageDaytimeForecast(
      payload.hourly.time,
      payload.hourly.temperature_2m,
      payload.hourly.relative_humidity_2m,
    );
    expect(average).toEqual({ tempC: 34, humidity: 78 });
    expect(payload.hourly.time).toHaveLength(FORECAST_HOURS);
  });

  it('requests a 72h hourly forecast in Asia/Bangkok and returns daytime averages', async () => {
    installWeatherSuccess(34, 78);
    const reading = await fetchWeather(13.65, 100.62);
    expect(reading).toEqual({
      tempC: 34,
      humidity: 78,
      fallback: false,
      basis: WEATHER_BASIS,
    });
    const fetchMock = global.fetch as unknown as { mock: { calls: unknown[][] } };
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain('https://api.open-meteo.com/v1/forecast');
    expect(requested).toContain('hourly=temperature_2m%2Crelative_humidity_2m');
    expect(requested).toContain(`forecast_hours=${FORECAST_HOURS}`);
    expect(requested).toContain(`timezone=${encodeURIComponent(WEATHER_TIMEZONE)}`);
  });

  it('uses 32°C / 75% when the request exceeds 3 seconds', async () => {
    expect(WEATHER_TIMEOUT_MS).toBe(3000);
    jest.useFakeTimers();
    global.fetch = jest.fn((_input: unknown, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }) as unknown as typeof fetch;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const pending = fetchWeather(13.65, 100.62);
      await jest.advanceTimersByTimeAsync(WEATHER_TIMEOUT_MS);
      await expect(pending).resolves.toEqual({
        tempC: PLAN_WEATHER_FALLBACK.tempC,
        humidity: PLAN_WEATHER_FALLBACK.humidity,
        fallback: true,
        basis: WEATHER_BASIS,
      });
      expect(PLAN_WEATHER_FALLBACK).toEqual({ tempC: 32, humidity: 75 });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
