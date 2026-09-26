/** Normalize a Thai crop name for duplicate comparison. */
export function normalizeNameTh(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\-_()（）]/g, '');
}

/** Standard Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
  }
  return dp[m]![n]!;
}

export interface CropSuggestion {
  id: number;
  name_th: string;
  name_en: string | null;
}

/**
 * Returns crops whose normalized name_th is within edit distance ≤ 2 of the normalized query.
 * Exact matches (distance 0) are also included.
 */
export function findNearMatches(
  nameTh: string,
  existing: CropSuggestion[],
): CropSuggestion[] {
  const query = normalizeNameTh(nameTh);
  return existing.filter((c) => levenshtein(query, normalizeNameTh(c.name_th)) <= 2);
}
