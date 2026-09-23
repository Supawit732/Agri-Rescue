export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
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
