export const C = {
  bg: '#F3F5EF',
  surface: '#FFFFFF',
  line: '#DCE2D6',
  lineStrong: '#C9D5C4',
  ink: '#1B241C',
  mute: '#56615A',
  leaf: '#2E6040',
  leafDeep: '#1F4A30',
  leafSoft: '#E4EDE2',
  urgentFg: '#A3231B',
  urgentBg: '#FBE3E0',
  soonFg: '#7A4F00',
  soonBg: '#FBEFD6',
  soonAccent: '#C98A12',
  okFg: '#1F4A30',
  okBg: '#E4EDE2',
  danger: '#A3231B',
  dangerBorder: '#B3261E',
  white: '#FFFFFF',
  disabled: '#A9B5A3',
  overlay: 'rgba(20, 28, 22, 0.5)',
  // Legacy aliases used across existing screens
  turmeric: '#C98A12',
  turmericSoft: '#FBEFD6',
  chili: '#A3231B',
  chiliSoft: '#FBE3E0',
} as const;

export const theme = C;

export const fonts = {
  title: 'Anuphan_600SemiBold',
  titleBold: 'Anuphan_700Bold',
  body: 'IBMPlexSansThai_400Regular',
  bodyMedium: 'IBMPlexSansThai_500Medium',
  bodySemi: 'IBMPlexSansThai_600SemiBold',
  /** Fallback stack when custom fonts are not loaded. */
  system: undefined as string | undefined,
} as const;

export const radius = {
  card: 16,
  cardLg: 18,
  control: 12,
  button: 14,
  chip: 18,
} as const;

export type UrgencyTone = 'critical' | 'soon' | 'ok';

export interface Urgency {
  fg: string;
  bg: string;
  tone: UrgencyTone;
}

/** Returns color tone only; callers should resolve the label via `t.urgency[tone]`. */
export function urgency(hoursLeft: number): Urgency {
  if (hoursLeft < 24) {
    return { fg: C.urgentFg, bg: C.urgentBg, tone: 'critical' };
  }
  if (hoursLeft < 48) {
    return { fg: C.soonFg, bg: C.soonBg, tone: 'soon' };
  }
  return { fg: C.okFg, bg: C.okBg, tone: 'ok' };
}

/** Soft tint used when a lot has no photo (stable per crop id). */
export function cropTint(cropId: number): string {
  const tints = ['#F4E4B0', '#D9E8CF', '#F1E8BE', '#F2D6CC', '#DCE8F0', '#E8DCF0'];
  return tints[Math.abs(cropId) % tints.length] ?? '#E4EDE2';
}
