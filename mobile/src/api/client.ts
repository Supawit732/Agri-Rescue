import { API_BASE_URL } from './config';

export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (fields !== undefined) {
      this.fields = fields;
    }
    if (details !== undefined) {
      this.details = details;
    }
  }
}

let unauthorizedHandler: (() => void) | null = null;

// AuthContext registers a handler so any 401 forces a logout back to login.
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  token?: string | null;
  body?: unknown;
}

export async function apiRequest<T>({ method = 'GET', path, token, body }: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token !== undefined && token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
  }

  if (response.status === 401) {
    // Only force logout for authenticated calls — login/register 401s carry their own message.
    if (token !== undefined && token !== null && token.length > 0) {
      if (unauthorizedHandler !== null) {
        unauthorizedHandler();
      }
      throw new ApiError(401, 'UNAUTHORIZED', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorBody = payload as {
      error?: {
        code?: string;
        message?: string;
        fields?: Record<string, string>;
        details?: Record<string, unknown>;
      };
    } | null;
    const code = errorBody?.error?.code ?? 'ERROR';
    const message = errorBody?.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    const fields = errorBody?.error?.fields;
    const details = errorBody?.error?.details;
    throw new ApiError(response.status, code, message, fields, details);
  }

  return payload as T;
}
