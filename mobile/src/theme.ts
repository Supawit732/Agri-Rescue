export const C = {
  leaf: '#2F6B3A',
  leafSoft: '#E3EEDF',
  bg: '#F6F8F2',
  ink: '#1F2A1F',
  mute: '#6B7565',
  line: '#DCE3D5',
  turmeric: '#C98A12',
  turmericSoft: '#FBF0D9',
  chili: '#C43B2C',
  chiliSoft: '#F8E1DE',
  white: '#FFFFFF',
  disabled: '#A9B5A3',
} as const;

export const theme = C;

export type UrgencyTone = 'critical' | 'soon' | 'ok';

export interface Urgency {
  fg: string;
  bg: string;
  tone: UrgencyTone;
}

/** Returns color tone only; callers should resolve the label via `t.urgency[tone]`. */
export function urgency(hoursLeft: number): Urgency {
  if (hoursLeft < 24) {
    return { fg: C.chili, bg: C.chiliSoft, tone: 'critical' };
  }
  if (hoursLeft < 48) {
    return { fg: C.turmeric, bg: C.turmericSoft, tone: 'soon' };
  }
  return { fg: C.leaf, bg: C.leafSoft, tone: 'ok' };
}
