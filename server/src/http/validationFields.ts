import type { ZodError } from 'zod';

/** Map Zod issues to `{ fieldPath: firstMessage }` for form field errors. */
export function fieldsFromZodError(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key =
      issue.path.length === 0
        ? '_form'
        : issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part)).join('.');
    if (fields[key] === undefined) {
      fields[key] = issue.message;
    }
  }
  return fields;
}
