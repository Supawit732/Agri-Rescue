import { z } from 'zod';
import { RIPENESS_LABELS } from '../db/seedData';

export const AI_VISION_TIMEOUT_MS = 20_000;
export const AI_VISION_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_AI_VISION_BASE_URL = 'https://opencode.ai/zen/go/v1';
export const DEFAULT_AI_VISION_MODEL = 'mimo-v2.6-flash';

export const aiAssessmentSchema = z.object({
  ripeness: z.number().int().min(0).max(4),
  confidence: z.number().min(0).max(1),
  defects: z.array(z.string()),
  note_th: z.string(),
});

export type AiAssessment = z.infer<typeof aiAssessmentSchema>;

export type AssessPhotoResult =
  | {
      available: true;
      ripeness: number;
      confidence: number;
      defects: string[];
      note_th: string;
      low_confidence: boolean;
      model: string;
    }
  | {
      available: false;
      reason: string;
    };

export interface VisionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function loadVisionConfig(env: NodeJS.ProcessEnv = process.env): VisionConfig {
  const baseUrl = (env.AI_VISION_BASE_URL ?? '').trim() || DEFAULT_AI_VISION_BASE_URL;
  const apiKey = (env.AI_VISION_API_KEY ?? '').trim();
  const model = (env.AI_VISION_MODEL ?? '').trim() || DEFAULT_AI_VISION_MODEL;
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, model };
}

export function buildRipenessPrompt(cropNameTh: string): string {
  const levels = RIPENESS_LABELS.map((label, index) => `${index} = ${label}`).join(', ');
  return [
    `คุณเป็นผู้ช่วยเกษตรประเมินความสุกของผลผลิตจากภาพถ่าย`,
    `พืชที่ประเมิน: ${cropNameTh}`,
    `ระดับความสุกที่อนุญาต: ${levels}`,
    `ตอบเป็น JSON เท่านั้น ตามสคีมา: {"ripeness":0-4,"confidence":0-1,"defects":["ตำหนิเป็นภาษาไทย"],"note_th":"คำอธิบายสั้นภาษาไทย"}`,
    `อย่าใส่ข้อความอื่นนอก JSON`,
  ].join('\n');
}

const ripenessJsonSchema = {
  type: 'object',
  properties: {
    ripeness: { type: 'integer', minimum: 0, maximum: 4 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    defects: { type: 'array', items: { type: 'string' } },
    note_th: { type: 'string' },
  },
  required: ['ripeness', 'confidence', 'defects', 'note_th'],
  additionalProperties: false,
} as const;

/** Pull the first JSON object from model text, including fenced ```json blocks. */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('ไม่พบ JSON ในคำตอบของโมเดล');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function unsupportedParamFromError(bodyText: string): 'response_format' | 'thinking' | 'both' {
  const lower = bodyText.toLowerCase();
  const hitsResponse = lower.includes('response_format');
  const hitsThinking = lower.includes('thinking');
  if (hitsResponse && !hitsThinking) {
    return 'response_format';
  }
  if (hitsThinking && !hitsResponse) {
    return 'thinking';
  }
  return 'both';
}

interface ChatPayloadOptions {
  includeResponseFormat: boolean;
  includeThinking: boolean;
}

function buildChatPayload(
  config: VisionConfig,
  cropNameTh: string,
  dataUri: string,
  options: ChatPayloadOptions,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildRipenessPrompt(cropNameTh) },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
  };
  if (options.includeResponseFormat) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'ripeness_assessment',
        strict: true,
        schema: ripenessJsonSchema,
      },
    };
  }
  if (options.includeThinking) {
    payload.thinking = { type: 'disabled' };
  }
  return payload;
}

async function postChatCompletions(
  config: VisionConfig,
  payload: Record<string, unknown>,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const sessionId = `agri-rescue-assess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      // OpenCode Go routes by session; other OpenAI-compatible hosts ignore unknown headers.
      'x-opencode-session': sessionId,
      'User-Agent': 'agri-rescue/0.1',
    },
    body: JSON.stringify(payload),
    signal,
  });
}

export async function assessRipenessFromPhoto(input: {
  cropNameTh: string;
  imageBase64: string;
  mime: 'image/jpeg' | 'image/png';
  config?: VisionConfig;
  fetchImpl?: typeof fetch;
}): Promise<AssessPhotoResult> {
  const config = input.config ?? loadVisionConfig();
  const fetchImpl = input.fetchImpl ?? fetch;

  if (config.apiKey === '') {
    return { available: false, reason: 'ไม่ได้ตั้งค่า AI_VISION_API_KEY' };
  }

  let imageBytes: Buffer;
  try {
    imageBytes = Buffer.from(input.imageBase64, 'base64');
  } catch {
    return { available: false, reason: 'ถอดรหัสรูปไม่สำเร็จ' };
  }
  if (imageBytes.length === 0) {
    return { available: false, reason: 'ไม่พบข้อมูลรูป' };
  }
  if (imageBytes.length > AI_VISION_MAX_BYTES) {
    return { available: false, reason: 'รูปใหญ่เกิน 5MB' };
  }

  const dataUri = `data:${input.mime};base64,${input.imageBase64}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_VISION_TIMEOUT_MS);

  try {
    let options: ChatPayloadOptions = { includeResponseFormat: true, includeThinking: true };
    let response = await postChatCompletions(
      config,
      buildChatPayload(config, input.cropNameTh, dataUri, options),
      controller.signal,
      fetchImpl,
    );

    if (response.status === 400) {
      const errorText = await response.text();
      const unsupported = unsupportedParamFromError(errorText);
      options = {
        includeResponseFormat: unsupported !== 'response_format' && unsupported !== 'both',
        includeThinking: unsupported !== 'thinking' && unsupported !== 'both',
      };
      response = await postChatCompletions(
        config,
        buildChatPayload(config, input.cropNameTh, dataUri, options),
        controller.signal,
        fetchImpl,
      );
    }

    if (!response.ok) {
      return { available: false, reason: `บริการประเมินภาพตอบ ${response.status}` };
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      return { available: false, reason: 'คำตอบจากโมเดลว่าง' };
    }

    let parsed: AiAssessment;
    try {
      parsed = aiAssessmentSchema.parse(extractJsonObject(content));
    } catch {
      return { available: false, reason: 'ถอด JSON จากโมเดลไม่สำเร็จ' };
    }

    return {
      available: true,
      ripeness: parsed.ripeness,
      confidence: parsed.confidence,
      defects: parsed.defects,
      note_th: parsed.note_th,
      low_confidence: parsed.confidence < 0.6,
      model: config.model,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { available: false, reason: 'หมดเวลารอประเมินภาพ' };
    }
    return { available: false, reason: 'เรียกบริการประเมินภาพไม่สำเร็จ' };
  } finally {
    clearTimeout(timer);
  }
}
