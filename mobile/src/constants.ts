import type { Grade } from './api/types';

export const RIPENESS_LABELS = ['ดิบ', 'เริ่มสุก', 'สุกพอดี', 'สุกมาก', 'ใกล้งอม'] as const;

export const GRADE_OPTIONS: { key: Grade; label: string }[] = [
  { key: 'normal', label: 'ปกติ' },
  { key: 'substandard', label: 'ตกเกรด' },
];

export const STATUS_LABELS: Record<string, string> = {
  open: 'เปิดขาย',
  reserved: 'จองแล้ว',
  partially_reserved: 'จองบางส่วน',
  fully_reserved: 'จองเต็มแล้ว',
  picked: 'รับของแล้ว',
  delivered: 'ส่งมอบแล้ว',
  expired: 'หมดอายุ',
  cancelled: 'ยกเลิก',
};
