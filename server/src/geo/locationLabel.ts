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
