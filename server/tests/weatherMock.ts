/** Build 72 Bangkok-local hourly points; daytime 10–17 use the given values, other hours differ. */
export function buildHourlyForecastMock(
  temperature = 32,
  humidity = 75,
): {
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
  };
} {
  const time: string[] = [];
  const temperature_2m: number[] = [];
  const relative_humidity_2m: number[] = [];
  for (let hourIndex = 0; hourIndex < 72; hourIndex += 1) {
    const day = 23 + Math.floor(hourIndex / 24);
    const hour = hourIndex % 24;
    time.push(`2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`);
    const daytime = hour >= 10 && hour <= 17;
    temperature_2m.push(daytime ? temperature : temperature + 8);
    relative_humidity_2m.push(daytime ? humidity : Math.min(100, humidity + 12));
  }
  return { hourly: { time, temperature_2m, relative_humidity_2m } };
}

export function installWeatherSuccess(temperature = 32, humidity = 75): void {
  const payload = buildHourlyForecastMock(temperature, humidity);
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

export function installWeatherFailure(): void {
  global.fetch = jest.fn(async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
}
