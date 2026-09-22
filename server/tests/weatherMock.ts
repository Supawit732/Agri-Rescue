export function installWeatherSuccess(temperature = 32, humidity = 75): void {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      current: { temperature_2m: temperature, relative_humidity_2m: humidity },
    }),
  })) as typeof fetch;
}
