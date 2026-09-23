import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../http/errors';
import { fieldsFromZodError } from '../http/validationFields';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields !== undefined ? { fields: error.fields } : {}),
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }
  if (error instanceof ZodError) {
    const fields = fieldsFromZodError(error);
    const message = error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง';
    res.status(400).json({ error: { code: 'VALIDATION', message, fields } });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'ข้อมูลไม่ถูกต้อง' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดภายในระบบ' } });
}
