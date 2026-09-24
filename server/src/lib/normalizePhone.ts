/**
 * Server-side phone normalize — accepts 0XX-XXX-XXXX, spaces, +66, bare digits.
 */
export function normalizePhone(raw: string): string {
  let s = String(raw ?? '').trim();
  s = s.replace(/[\s\-().]/g, '');
  if (s.startsWith('+66')) {
    s = `0${s.slice(3)}`;
  } else if (s.startsWith('66') && !s.startsWith('660')) {
    const rest = s.slice(2);
    if (rest.startsWith('8') || rest.startsWith('0')) {
      s = `0${rest.replace(/^0/, '')}`;
    }
  }
  s = s.replace(/\D/g, '');
  // Paste without leading 0: 800000011 (9 digits) → 0800000011
  if (s.length === 9 && s.startsWith('8')) {
    s = `0${s}`;
  }
  return s;
}

export function isValidThaiPhone(digits: string): boolean {
  return /^0\d{9}$/.test(digits);
}
