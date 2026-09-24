import type { Grade } from './api/types';
import th from './i18n/th';
import type { Messages } from './i18n/types';

/**
 * @deprecated Prefer `t.ripenessLabels` / `t.grade` / `t.status` from `useI18n()`.
 * Kept as Thai fallbacks for callers not yet migrated.
 */
export const RIPENESS_LABELS = th.ripenessLabels;

/** @deprecated Prefer `t.grade` via useI18n(). */
export const GRADE_OPTIONS: { key: Grade; label: string }[] = [
  { key: 'normal', label: th.grade.normal },
  { key: 'substandard', label: th.grade.substandard },
];

/** @deprecated Prefer `t.status` via useI18n(). */
export const STATUS_LABELS: Record<string, string> = { ...th.status };

export function gradeOptions(t: Messages): { key: Grade; label: string }[] {
  return [
    { key: 'normal', label: t.grade.normal },
    { key: 'substandard', label: t.grade.substandard },
  ];
}
