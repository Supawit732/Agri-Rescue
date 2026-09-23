import { ZodError, z } from 'zod';
import { fieldsFromZodError } from '../../src/http/validationFields';
import { errorHandler } from '../../src/middleware/errorHandler';
import type { Request, Response } from 'express';

function runHandler(error: unknown): { status: number; body: unknown } {
  let status = 0;
  let body: unknown = null;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;
  errorHandler(error, {} as Request, res, (() => undefined) as never);
  return { status, body };
}

describe('validation fields error shape', () => {
  it('maps Zod issues to error.fields by path', () => {
    const schema = z.object({
      phone: z.string().regex(/^\d{9,15}$/, 'เบอร์โทรไม่ถูกต้อง'),
      password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'),
      weight_kg: z.number().positive('น้ำหนักต้องมากกว่า 0'),
    });
    let caught: ZodError | null = null;
    try {
      schema.parse({ phone: 'abc', password: 'short', weight_kg: -1 });
    } catch (error) {
      caught = error as ZodError;
    }
    expect(caught).toBeInstanceOf(ZodError);
    const fields = fieldsFromZodError(caught!);
    expect(fields.phone).toBe('เบอร์โทรไม่ถูกต้อง');
    expect(fields.password).toBe('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    expect(fields.weight_kg).toBe('น้ำหนักต้องมากกว่า 0');

    const handled = runHandler(caught);
    expect(handled.status).toBe(400);
    const payload = handled.body as {
      error: { code: string; message: string; fields: Record<string, string> };
    };
    expect(payload.error.code).toBe('VALIDATION');
    expect(payload.error.fields.phone).toBe('เบอร์โทรไม่ถูกต้อง');
    expect(payload.error.fields.password).toContain('8');
  });

  it('uses dotted paths for nested keys', () => {
    const schema = z.object({
      contact: z.object({
        email: z.string().email('อีเมลไม่ถูกต้อง'),
      }),
    });
    try {
      schema.parse({ contact: { email: 'nope' } });
    } catch (error) {
      const fields = fieldsFromZodError(error as ZodError);
      expect(fields['contact.email']).toBe('อีเมลไม่ถูกต้อง');
    }
  });
});
