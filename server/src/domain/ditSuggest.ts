export interface DitProductCandidate {
  product_id: string;
  product_name: string;
  sell_type: string | null;
  category_name: string | null;
  /** Parsed from name parentheses, or 'unknown' */
  unit: string;
}

/** Trim trailing whitespace/newlines common in MOC product names. */
export function normalizeMocProductName(name: string): string {
  return name.replace(/\r/g, '').replace(/\n+/g, ' ').trim();
}

/**
 * Parse unit from name parentheses e.g. "(บาท/กก.)" → "กก."
 * No baht/unit paren → "unknown" (never guess from other text).
 */
export function parseUnitFromProductName(name: string): string {
  const trimmed = normalizeMocProductName(name);
  const match = /\(\s*บาท\s*\/\s*([^)]+?)\s*\)/i.exec(trimmed);
  if (match === null || match[1] === undefined) {
    return 'unknown';
  }
  return normalizeUnitLabel(match[1]);
}

export function normalizeUnitLabel(raw: string): string {
  const cleaned = raw.replace(/\.$/, '').trim();
  if (cleaned === '' || cleaned === 'unknown') {
    return 'unknown';
  }
  if (cleaned === 'กก' || cleaned === 'กิโล' || cleaned === 'กิโลกรัม') {
    return 'กก.';
  }
  return cleaned.endsWith('.') ? cleaned : cleaned;
}

const STORE_OR_ORG_PATTERN =
  /อินทรีย์|ร้าน|ห้าง|ซูเปอร์มาร์เก็ต|มาร์เก็ต|แม็คโคร|โลตัส|บิ๊กซี|ท็อปซูเปอร์|ท็อปส์|เลมอนฟาร์ม|เซเว่น|gourmet|foodland|villa/i;

const PROCESSED_PATTERN = /หิมพานต์|แห้ง|ดอง|แช่อิ่ม|กระป๋อง|\bอบ\b|แปรรูป|คั่ว|บด|ผง|น้ำมัน/;

/** Drop organic / store / mall branded SKUs from auto-suggest. */
export function isExcludedDitProductName(name: string): boolean {
  return STORE_OR_ORG_PATTERN.test(normalizeMocProductName(name));
}

/** Drop processed / dried / pickled SKUs that share a crop name substring. */
export function isProcessedDitProductName(name: string): boolean {
  return PROCESSED_PATTERN.test(normalizeMocProductName(name));
}

/**
 * Prefer unit from MOC price response; fall back to parentheses in product name.
 */
export function resolveDitUnit(input: {
  priceUnit: string | null | undefined;
  nameUnit: string | null | undefined;
}): string {
  const price = input.priceUnit?.trim();
  if (price !== undefined && price !== '') {
    return price;
  }
  const name = input.nameUnit?.trim();
  if (name !== undefined && name !== '' && name !== 'unknown') {
    return name.startsWith('บาท') ? name : `บาท/${name}`;
  }
  return 'unknown';
}

function sellTypeRank(sellType: string | null): number {
  if (sellType === 'ขายส่ง') {
    return 0;
  }
  if (sellType === 'ขายปลีก') {
    return 1;
  }
  return 2;
}

function unitRank(unit: string): number {
  return unit === 'กก.' ? 0 : 1;
}

function gradeWordRank(name: string): number {
  const n = normalizeMocProductName(name);
  if (n.includes('คละ')) {
    return 0;
  }
  if (n.includes('คัด')) {
    return 2;
  }
  return 1;
}

export function compareDitSuggestions(a: DitProductCandidate, b: DitProductCandidate): number {
  return (
    sellTypeRank(a.sell_type) - sellTypeRank(b.sell_type) ||
    unitRank(a.unit) - unitRank(b.unit) ||
    gradeWordRank(a.product_name) - gradeWordRank(b.product_name) ||
    a.product_name.localeCompare(b.product_name, 'th') ||
    a.product_id.localeCompare(b.product_id)
  );
}

export function toDitCandidate(input: {
  product_id: string;
  product_name: string;
  sell_type: string | null;
  category_name: string | null;
}): DitProductCandidate {
  const product_name = normalizeMocProductName(input.product_name);
  return {
    product_id: input.product_id.trim(),
    product_name,
    sell_type: input.sell_type,
    category_name: input.category_name,
    unit: parseUnitFromProductName(product_name),
  };
}

/**
 * Ranked suggestions: crop name substring match, excluding store/organic SKUs.
 * Default top 3.
 */
export function suggestDitProducts(
  cropNameTh: string,
  products: DitProductCandidate[],
  limit = 3,
): DitProductCandidate[] {
  const needle = normalizeMocProductName(cropNameTh);
  if (needle === '') {
    return [];
  }
  return products
    .filter(
      (p) =>
        p.product_id !== '' &&
        p.product_name.includes(needle) &&
        !isExcludedDitProductName(p.product_name) &&
        !isProcessedDitProductName(p.product_name),
    )
    .sort(compareDitSuggestions)
    .slice(0, limit);
}

export function searchDitProducts(
  query: string,
  products: DitProductCandidate[],
  limit = 20,
): DitProductCandidate[] {
  const q = normalizeMocProductName(query);
  if (q === '') {
    return [];
  }
  return products
    .filter((p) => p.product_name.includes(q) || p.product_id.includes(q))
    .sort(compareDitSuggestions)
    .slice(0, limit);
}
