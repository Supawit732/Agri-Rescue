# แผนภาพสถานะ (State Diagram)

## ล็อต (`harvest_lots.status`)

นิยามสถานะและ transition ที่อนุญาตอยู่ใน `server/src/domain/lotStateMachine.ts` เท่านั้น  
ฟังก์ชัน `assertLotTransition(from, to)` จะโยน `InvalidLotTransitionError` ถ้าไม่อยู่ในรายการด้านล่าง

สถานะใน type/ENUM: `open | reserved | picked | delivered | expired | cancelled`

> หมายเหตุจากโค้ด: มีค่า `cancelled` ใน ENUM และ type แต่**ไม่มี transition ใดใน `TRANSITIONS` ที่ไปหรือจาก `cancelled`**  
> เมื่อผู้ซื้อยกเลิกออเดอร์ ล็อตกลับเป็น `open` (เส้น `reserved → open`) ไม่ได้ตั้งล็อตเป็น `cancelled`

```mermaid
stateDiagram-v2
  [*] --> open: สร้างล็อต POST lots

  open --> reserved: ผู้ซื้อจองหรือรับบริจาค
  reserved --> open: ผู้ซื้อยกเลิกออเดอร์ที่ยังไม่มี batch
  reserved --> picked: คนขับยืนยัน pickup
  picked --> delivered: คนขับยืนยัน drop ด้วย OTP ถูกต้อง

  open --> expired: job expireOpenLots เมื่อ expires_at ถึงแล้ว

  delivered --> [*]
  expired --> [*]
```

### ตาราง transition ที่อนุญาต (คัดจากโค้ด)

| จาก | ไป | เหตุการณ์ในระบบ |
|---|---|---|
| open | reserved | `POST /api/orders` |
| reserved | picked | `POST /api/stops/:id/confirm` แบบ pickup |
| picked | delivered | `POST /api/stops/:id/confirm` แบบ drop สำเร็จ |
| open | expired | `expireOpenLots` |
| reserved | open | `DELETE /api/orders/:id` |

## ออเดอร์ (`orders.status`)

ไม่มีโมดูล state machine แยกสำหรับออเดอร์ สถานะถูกเปลี่ยนใน service ดังนี้

ENUM: `reserved | picked | delivered | cancelled`

```mermaid
stateDiagram-v2
  [*] --> reserved: POST orders สร้างคำสั่งซื้อ

  reserved --> cancelled: DELETE orders เมื่อยังไม่มี batch_id
  reserved --> picked: คนขับยืนยัน pickup ของล็อตนั้น
  picked --> delivered: คนขับยืนยัน drop ด้วย OTP ถูกต้อง

  cancelled --> [*]
  delivered --> [*]
```

| จาก | ไป | เงื่อนไขจากโค้ด |
|---|---|---|
| — | reserved | จองสำเร็จ; สร้าง `drop_otp` 4 หลัก |
| reserved | cancelled | เจ้าของออเดอร์ยกเลิก และ `batch_id IS NULL` มิฉะนั้น 409 |
| reserved | picked | pickup ของล็อตในรอบนั้น |
| picked | delivered | drop สำเร็จและเขียน `impact_logs` |

ออเดอร์ที่ถูกผูก `batch_id` แล้วยกเลิกไม่ได้ (`ORDER_IN_BATCH`)
