import { z } from 'zod';
import { RIPENESS_LABELS } from '../db/seedData';

export const AI_VISION_TIMEOUT_MS = 20_000;
export const AI_VISION_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_AI_VISION_BASE_URL = 'https://opencode.ai/zen/go/v1';
export const DEFAULT_AI_VISION_MODEL = 'mimo-v2.6-flash';

export const aiAssessmentSchema = z.object({
  subject_match: z.boolean(),
  ripeness: z.number().int().min(0).max(4),
  confidence: z.number().min(0).max(1),
  defects: z.array(z.string()),
  defects_en: z.array(z.string()),
  note_th: z.string(),
  note_en: z.string(),
});

export type AiAssessment = z.infer<typeof aiAssessmentSchema>;

export type AssessPhotoResult =
  | {
      available: true;
      subject_match: true;
      ripeness: number;
      confidence: number;
      defects: string[];
      defects_en: string[];
      note_th: string;
      note_en: string;
      low_confidence: boolean;
      model: string;
    }
  | {
      available: true;
      subject_match: false;
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

export function buildRipenessPrompt(
  cropNameTh: string,
  features?: { normalFeaturesTh?: string | null; defectExamplesTh?: string | null },
): string {
  const levels = RIPENESS_LABELS.map((label, index) => `${index} = ${label}`).join(', ');
  const normal = features?.normalFeaturesTh?.trim() || 'ลักษณะปกติทั่วไปของพืชชนิดนี้';
  const defects = features?.defectExamplesTh?.trim() || 'รอยช้ำ แผลแตก รา จุดดำยุบ';
  return [
    `คุณเป็นผู้ช่วยเกษตรประเมินความสุกของผลผลิตจากภาพถ่าย`,
    `พืชที่ประเมิน: ${cropNameTh}`,
    `ตั้ง subject_match = true เฉพาะเมื่อในรูปเห็น${cropNameTh}ชัดเจน ถ้าไม่มีหรือเป็นพืชอื่นให้เป็น false`,
    `ลักษณะปกติของ${cropNameTh} (ห้ามนับเป็นตำหนิ): ${normal}`,
    `ตัวอย่างตำหนิของ${cropNameTh}: ${defects}`,
    `ห้ามนับลักษณะปกติเป็นตำหนิ; ถ้าไม่มีตำหนิจริงให้ defects และ defects_en เป็น [] ได้`,
    `ระดับความสุกที่อนุญาต: ${levels}`,
    `ตอบเป็น JSON เท่านั้น ตามสคีมา: {"subject_match":true|false,"ripeness":0-4,"confidence":0-1,"defects":["ตำหนิเป็นภาษาไทย"],"defects_en":["same defects in English"],"note_th":"คำอธิบายสั้นภาษาไทย","note_en":"short English note"}`,
    `defects และ defects_en ต้องมีความหมายคู่กัน (จำนวนและลำดับเดียวกัน); note_th กับ note_en เช่นกัน`,
    `ถ้า subject_match เป็น false ยังต้องใส่ ripeness/confidence/defects/defects_en/note_th/note_en ได้ (ค่าประมาณก็ได้) แต่ระบบจะไม่ใช้ค่าความสุก`,
    `อย่าใส่ข้อความอื่นนอก JSON`,
  ].join('\n');
}

const ripenessJsonSchema = {
  type: 'object',
  properties: {
    subject_match: { type: 'boolean' },
    ripeness: { type: 'integer', minimum: 0, maximum: 4 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    defects: { type: 'array', items: { type: 'string' } },
    defects_en: { type: 'array', items: { type: 'string' } },
    note_th: { type: 'string' },
    note_en: { type: 'string' },
  },
  required: ['subject_match', 'ripeness', 'confidence', 'defects', 'defects_en', 'note_th', 'note_en'],
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
  features?: { normalFeaturesTh?: string | null; defectExamplesTh?: string | null },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildRipenessPrompt(cropNameTh, features) },
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
  normalFeaturesTh?: string | null;
  defectExamplesTh?: string | null;
  config?: VisionConfig;
  fetchImpl?: typeof fetch;
}): Promise<AssessPhotoResult> {
  const config = input.config ?? loadVisionConfig();
  const fetchImpl = input.fetchImpl ?? fetch;
  const features = {
    normalFeaturesTh: input.normalFeaturesTh,
    defectExamplesTh: input.defectExamplesTh,
  };

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
      buildChatPayload(config, input.cropNameTh, dataUri, options, features),
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
        buildChatPayload(config, input.cropNameTh, dataUri, options, features),
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

    if (!parsed.subject_match) {
      return { available: true, subject_match: false };
    }

    return {
      available: true,
      subject_match: true,
      ripeness: parsed.ripeness,
      confidence: parsed.confidence,
      defects: parsed.defects,
      defects_en: parsed.defects_en,
      note_th: parsed.note_th,
      note_en: parsed.note_en,
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
