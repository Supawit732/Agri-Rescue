/**
 * Sellers can only exchange phone/LINE/contact details after a buyer books (rule 6.7).
 * This guard blocks that contact info from being smuggled into the free-text lot description.
 */
export type ContactInfoKind = 'phone' | 'url' | 'email' | 'line';

const URL_RE = /(https?:\/\/|www\.)\S+/i;
const BARE_DOMAIN_RE = /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(com|net|org|co|io|me|app|shop|store|link|page)\b/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const LINE_AT_ID_RE = /@[a-zA-Z0-9._-]{2,}/;
/** "line" as a standalone word (or "line id"/"lineid") — avoids matching "online", "deadline", "linear". */
const LINE_WORD_RE = /\bline\b/i;
const LINE_ID_COMPACT_RE = /line\s*id/i;
/** A run of digits and separators long enough to hide a Thai phone number once separators are stripped. */
const DIGIT_RUN_RE = /[0-9][0-9\s.-]{7,}[0-9]/g;

function stripsToThaiPhone(run: string): boolean {
  const digits = run.replace(/[\s.-]/g, '');
  if (/^0\d{8,9}$/.test(digits)) {
    return true;
  }
  if (/^(?:\+66|66)\d{8,9}$/.test(digits)) {
    return true;
  }
  return false;
}

function containsThaiPhone(text: string): boolean {
  const matches = text.match(DIGIT_RUN_RE);
  if (matches === null) {
    return false;
  }
  return matches.some(stripsToThaiPhone);
}

function containsUrl(text: string): boolean {
  return URL_RE.test(text) || BARE_DOMAIN_RE.test(text);
}

function containsEmail(text: string): boolean {
  return EMAIL_RE.test(text);
}

function containsLineId(text: string): boolean {
  return (
    LINE_WORD_RE.test(text) ||
    LINE_ID_COMPACT_RE.test(text) ||
    text.includes('ไลน์') ||
    LINE_AT_ID_RE.test(text)
  );
}

/** Returns the first kind of contact info found, or null if the text is clean. */
export function findContactInfoInDescription(text: string): ContactInfoKind | null {
  if (containsEmail(text)) {
    return 'email';
  }
  if (containsUrl(text)) {
    return 'url';
  }
  if (containsThaiPhone(text)) {
    return 'phone';
  }
  if (containsLineId(text)) {
    return 'line';
  }
  return null;
}

export function hasContactInfo(text: string): boolean {
  return findContactInfoInDescription(text) !== null;
}
