import {
  AI_VISION_TIMEOUT_MS,
  assessRipenessFromPhoto,
  extractJsonObject,
  loadVisionConfig,
  type VisionConfig,
} from '../../src/ai/vision';

const sampleAssessment = {
  ripeness: 2,
  confidence: 0.82,
  defects: ['จุดช้ำเล็กน้อย'],
  note_th: 'สุกพอดี เหมาะขายด่วน',
};

const testConfig: VisionConfig = {
  baseUrl: 'https://vision.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function completionWithContent(content: string): unknown {
  return { choices: [{ message: { content } }] };
}

describe('AI vision client', () => {
  it('loads defaults when env values are blank', () => {
    expect(
      loadVisionConfig({
        AI_VISION_BASE_URL: '',
        AI_VISION_API_KEY: '',
        AI_VISION_MODEL: '',
      }),
    ).toEqual({
      baseUrl: 'https://opencode.ai/zen/go/v1',
      apiKey: '',
      model: 'mimo-v2.6-flash',
    });
  });

  it('extracts JSON from a fenced code block', () => {
    const text = 'ผลลัพธ์:\n```json\n{"ripeness":3,"confidence":0.9,"defects":[],"note_th":"สุกมาก"}\n```\n';
    expect(extractJsonObject(text)).toEqual({
      ripeness: 3,
      confidence: 0.9,
      defects: [],
      note_th: 'สุกมาก',
    });
  });

  it('returns an assessment on success', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(completionWithContent(JSON.stringify(sampleAssessment))));
    const result = await assessRipenessFromPhoto({
      cropNameTh: 'มะม่วง',
      imageBase64: Buffer.from('fake-image').toString('base64'),
      mime: 'image/jpeg',
      config: testConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      available: true,
      ...sampleAssessment,
      low_confidence: false,
      model: 'test-model',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(firstCall[1].body)) as {
      response_format?: unknown;
      thinking?: unknown;
      messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>;
    };
    expect(payload.response_format).toBeDefined();
    expect(payload.thinking).toEqual({ type: 'disabled' });
    expect(payload.messages[0]?.content.some((part) => part.type === 'image_url')).toBe(true);
  });

  it('parses assessment JSON wrapped in a code fence', async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(sampleAssessment)}\n\`\`\``;
    const fetchImpl = jest.fn(async () => jsonResponse(completionWithContent(fenced)));
    const result = await assessRipenessFromPhoto({
      cropNameTh: 'มะม่วง',
      imageBase64: Buffer.from('img').toString('base64'),
      mime: 'image/png',
      config: testConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.ripeness).toBe(2);
    }
  });

  it('returns available false when JSON is invalid', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(completionWithContent('ไม่ใช่ json เลย')));
    const result = await assessRipenessFromPhoto({
      cropNameTh: 'มะม่วง',
      imageBase64: Buffer.from('img').toString('base64'),
      mime: 'image/jpeg',
      config: testConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ available: false, reason: 'ถอด JSON จากโมเดลไม่สำเร็จ' });
  });

  it('retries once without unsupported parameters after HTTP 400', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'unknown parameter: response_format',
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce(jsonResponse(completionWithContent(JSON.stringify(sampleAssessment))));

    const result = await assessRipenessFromPhoto({
      cropNameTh: 'มะม่วง',
      imageBase64: Buffer.from('img').toString('base64'),
      mime: 'image/jpeg',
      config: testConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.available).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondCall = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    const secondPayload = JSON.parse(String(secondCall[1].body)) as {
      response_format?: unknown;
      thinking?: unknown;
    };
    expect(secondPayload.response_format).toBeUndefined();
    expect(secondPayload.thinking).toEqual({ type: 'disabled' });
  });

  it('returns available false on timeout', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn((_url: unknown, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });
    try {
      const pending = assessRipenessFromPhoto({
        cropNameTh: 'มะม่วง',
        imageBase64: Buffer.from('img').toString('base64'),
        mime: 'image/jpeg',
        config: testConfig,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      await jest.advanceTimersByTimeAsync(AI_VISION_TIMEOUT_MS);
      await expect(pending).resolves.toEqual({ available: false, reason: 'หมดเวลารอประเมินภาพ' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns available false when API key is missing', async () => {
    const fetchImpl = jest.fn();
    const result = await assessRipenessFromPhoto({
      cropNameTh: 'มะม่วง',
      imageBase64: Buffer.from('img').toString('base64'),
      mime: 'image/jpeg',
      config: { ...testConfig, apiKey: '' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ available: false, reason: 'ไม่ได้ตั้งค่า AI_VISION_API_KEY' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('flags low confidence below 0.6', async () => {
    const low = { ...sampleAssessment, confidence: 0.42 };
    const fetchImpl = jest.fn(async () => jsonResponse(completionWithContent(JSON.stringify(low))));
    const result = await assessRipenessFromPhoto({
      cropNameTh: 'มะม่วง',
      imageBase64: Buffer.from('img').toString('base64'),
      mime: 'image/jpeg',
      config: testConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      available: true,
      ...low,
      low_confidence: true,
      model: 'test-model',
    });
  });
});
