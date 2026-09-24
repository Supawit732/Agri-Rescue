/** Prefer ตำบล/อำเภอ labels; fall back to plot name when labels are missing. */
export function locationDisplayLabel(
  subdistrictTh: string | null | undefined,
  districtTh: string | null | undefined,
  fallback: string | null | undefined = null,
): string | null {
  const sub = subdistrictTh === null || subdistrictTh === undefined ? '' : String(subdistrictTh).trim();
  const dist = districtTh === null || districtTh === undefined ? '' : String(districtTh).trim();
  const parts = [sub, dist].filter((p) => p !== '');
  if (parts.length > 0) {
    return parts.join(' · ');
  }
  if (fallback === null || fallback === undefined) {
    return null;
  }
  const fb = String(fallback).trim();
  return fb === '' ? null : fb;
}

/** Language-aware label: prefer English columns when locale=en. */
export function locationDisplayLabelFor(
  locale: 'th' | 'en',
  labels: {
    subdistrict_th?: string | null;
    district_th?: string | null;
    subdistrict_en?: string | null;
    district_en?: string | null;
    fallback?: string | null;
  },
): string | null {
  if (locale === 'en') {
    const subEn = labels.subdistrict_en == null || labels.subdistrict_en === '' ? null : labels.subdistrict_en;
    const distEn = labels.district_en == null || labels.district_en === '' ? null : labels.district_en;
    if (subEn !== null || distEn !== null) {
      return locationDisplayLabel(subEn, distEn, labels.fallback ?? null);
    }
    // Prefer Thai admin labels over plot name when EN columns are empty.
    return locationDisplayLabel(
      labels.subdistrict_th ?? null,
      labels.district_th ?? null,
      labels.fallback ?? null,
    );
  }
  return locationDisplayLabel(
    labels.subdistrict_th ?? null,
    labels.district_th ?? null,
    labels.fallback ?? null,
  );
}
