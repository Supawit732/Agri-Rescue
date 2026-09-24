/** Pure phone/email helpers. No React / no I/O. */

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

export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 10)}-${d.slice(10)}`;
}

function firstDiffIndex(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return n;
}

/**
 * Format-as-you-type with auto dashes.
 * - Typing / paste: reformat from digits (paste with +66/spaces → 0XXXXXXXXX).
 * - Backspace on a dash: also delete the digit immediately before that dash.
 */
export function formatPhoneOnChange(prevFormatted: string, nextRaw: string): string {
  const next = String(nextRaw ?? '');
  if (next.length >= prevFormatted.length) {
    const hasPasteSignals = /[+()\s]/.test(next) || (next.match(/\d/g)?.length ?? 0) > 11;
    if (hasPasteSignals) {
      return formatPhone(normalizePhone(next));
    }
    return formatPhone(next.replace(/\D/g, ''));
  }

  const prevDigits = prevFormatted.replace(/\D/g, '');
  const nextDigits = next.replace(/\D/g, '');
  if (nextDigits.length === prevDigits.length) {
    const idx = firstDiffIndex(prevFormatted, next);
    if (prevFormatted[idx] === '-') {
      let digitsBefore = 0;
      for (let i = 0; i < idx; i += 1) {
        if (/\d/.test(prevFormatted[i] ?? '')) digitsBefore += 1;
      }
      const arr = prevDigits.split('');
      const removeAt = digitsBefore - 1;
      if (removeAt >= 0 && removeAt < arr.length) {
        arr.splice(removeAt, 1);
      }
      return formatPhone(arr.join(''));
    }
  }
  return formatPhone(nextDigits);
}

// --- Email ---

export const EMAIL_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'icloud.com',
  'ku.th',
] as const;

const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'iclod.com': 'icloud.com',
};

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n]!;
}

export function suggestDomains(afterAt: string): string[] {
  const typed = afterAt.toLowerCase();
  if (typed === '') return [...EMAIL_DOMAINS];
  return EMAIL_DOMAINS.filter((d) => d.startsWith(typed));
}

/** Near-miss domain suggestion (optional — never blocks). */
export function suggestDomainFix(domain: string): string | null {
  const d = domain.toLowerCase().trim();
  if (d === '' || EMAIL_DOMAINS.includes(d as (typeof EMAIL_DOMAINS)[number])) return null;
  const typo = DOMAIN_TYPOS[d];
  if (typo) return typo;
  for (const known of EMAIL_DOMAINS) {
    if (Math.abs(d.length - known.length) <= 2 && editDistance(d, known) <= 2) {
      return known;
    }
  }
  return null;
}

export function splitEmail(email: string): { local: string; domain: string } {
  const i = email.indexOf('@');
  if (i < 0) return { local: email, domain: '' };
  return { local: email.slice(0, i), domain: email.slice(i + 1) };
}

export function normalizeEmail(raw: string): string {
  return String(raw ?? '').trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(raw));
}

/** No autocapitalize/autocorrect — identity preserved for display. */
export function formatEmailOnChange(raw: string): string {
  return raw;
}
