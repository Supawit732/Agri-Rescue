/**
 * Map legacy Thai server messages → stable codes for client translation (D025).
 * Prefer server sending codes directly; this covers Zod/HttpError Thai still in flight.
 */
export const SERVER_MESSAGE_TO_CODE: Record<string, string> = {
  'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่': 'NETWORK',
  'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่': 'UNAUTHORIZED',
  'กรุณาเข้าสู่ระบบ': 'UNAUTHORIZED',
  'เกิดข้อผิดพลาด กรุณาลองใหม่': 'ERROR',
  'เกิดข้อผิดพลาดภายในระบบ': 'INTERNAL',
  'ข้อมูลไม่ถูกต้อง': 'VALIDATION',
  'ไม่มีสิทธิ์เข้าถึง': 'FORBIDDEN',
  'ไม่พบล็อต': 'NOT_FOUND',
  'ไม่พบคำสั่งซื้อ': 'NOT_FOUND',
  'ล็อตนี้หมดอายุแล้ว': 'LOT_EXPIRED',
  'ล็อตนี้จองเพิ่มไม่ได้แล้ว': 'LOT_NOT_OPEN',
  'รหัสยืนยันไม่ถูกต้อง': 'OTP_MISMATCH',
  'จุดนี้ถูกล็อกเพราะกรอครหัสยืนยันผิดครบ 5 ครั้ง': 'OTP_LOCKED',
  'จุดนี้ถูกล็อกเพราะกรอกรหัสยืนยันผิดครบ 5 ครั้ง': 'OTP_LOCKED',
  'ยกเลิกไม่ได้เพราะคำสั่งซื้ออยู่ในรอบวิ่งแล้ว': 'ORDER_IN_BATCH',
  'ต้องรับสินค้าก่อนส่งมอบ': 'PICKUP_REQUIRED',
  'จุดนี้ยืนยันไปแล้ว': 'STOP_DONE',
  'เรียกดูตลาดบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่': 'RATE_LIMIT',
  'เรียกบริการตำแหน่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่': 'RATE_LIMIT',
  // field-level
  'เบอร์โทรไม่ถูกต้อง': 'INVALID_PHONE',
  'กรุณากรอกรหัสผ่าน': 'REQUIRED',
  'กรุณากรอกข้อมูลนี้': 'REQUIRED',
  'กรุณาระบุจำนวนกิโลกรัม': 'quantity_required',
  'ล็อตนี้ไม่มีน้ำหนักคงเหลือ': 'quantity_exceeds_remaining',
  'ล็อตนี้ขายยกล็อตเท่านั้น ต้องจองเต็มจำนวนคงเหลือ': 'quantity_whole_lot',
  'ขั้นการจองไม่ถูกต้อง': 'quantity_step',
  'น้ำหนักต้องมากกว่า 0': 'INVALID_NUMBER',
  'ราคาเริ่มต้องไม่เกินราคาตลาดวันนั้น': 'start_above_market',
  'ราคาต่ำสุดต้องไม่เกินราคาเริ่ม': 'floor_above_start',
  'ต้องยอมรับข้อกำหนดก่อนส่งคำขอ': 'terms_required',
  'กรุณายอมรับข้อกำหนดฉบับล่าสุด': 'terms_required',
  'กรุณาระบุวัตถุประสงค์': 'REQUIRED',
  'กรุณากรอกชื่อองค์กร': 'REQUIRED',
  'กรุณาเลือกประเภทองค์กร': 'MUST_SELECT',
  'กรุณาระบุว่าจดทะเบียนหรือไม่': 'MUST_SELECT',
  'กรุณากรอกที่อยู่ตามทะเบียน': 'REQUIRED',
  'กรุณากรอกตำแหน่งผู้ติดต่อ': 'REQUIRED',
  'กรุณาระบุจำนวนผู้รับประโยชน์': 'REQUIRED',
  'กรุณาเลือกรูปแบบการแจกจ่าย': 'MUST_SELECT',
  'กรุณาระบุสถานที่แจกประจำ': 'REQUIRED',
  'กรุณาระบุความถี่การแจก': 'REQUIRED',
  'ต้องแนบหนังสือรับรองการจดทะเบียนหรือหนังสือรับรองจากชุมชนอย่างน้อย 1 ไฟล์': 'docs_required',
  'ต้องแนบรูปสถานที่ 1–3 รูป': 'photos_required',
  'เลือกอย่างน้อยหนึ่งบทบาท: ขาย หรือ ซื้อ': 'role_required',
  'กรุณาระบุประเภทผู้ซื้อ': 'MUST_SELECT',
  'ประเภทผู้ซื้อใช้ได้เฉพาะเมื่อเปิดสิทธิ์ซื้อ': 'INVALID',
  'ไม่มีข้อมูลที่จะอัปเดต': 'VALIDATION',
};

export function resolveMessageCode(codeOrMessage: string): string {
  return SERVER_MESSAGE_TO_CODE[codeOrMessage] ?? codeOrMessage;
}
