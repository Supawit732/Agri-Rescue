# กระบวนการธุรกิจ (Business Flow)

อ้างอิง flow จริงจาก `orders.ts`, `lots.ts`, `ai/vision.ts`, `createBatch.ts`, `confirmStop.ts`, `expireLots.ts`, `openMeteo.ts`, `impactSummary.ts`

## Flowchart ภาพรวม

```mermaid
flowchart TD
  start([เริ่ม]) --> photo{เกษตรกรถ่ายรูปให้ AI?}
  photo -->|ใช่| assess[POST lots assess-photo]
  assess --> subject{subject_match?}
  subject -->|ไม่| pickRipe[เลือกความสุกเอง]
  subject -->|ใช่| aiRipe[เติม chip ความสุกจาก AI]
  aiRipe --> editRipe{เกษตรกรแก้ chip?}
  editRipe -->|ใช่หรือไม่| estimate
  photo -->|ไม่| pickRipe --> estimate
  estimate[เกษตรกรประเมิน shelf-life และราคา]
  estimate --> weather{อากาศจาก Open-Meteo สำเร็จ?}
  weather -->|ใช่ weather_source live| createLot[ลงล็อต status open]
  weather -->|ไม่ weather_source fallback| createLot
  createLot --> expireCheck{expires_at ผ่าน และยัง open?}
  expireCheck -->|ใช่ job ทุก 10 นาที| expired[ล็อต expired]
  expireCheck -->|ยังไม่หมดอายุ| market[ผู้ซื้อเห็นในตลาดด่วน]
  market --> book{จองหรือรับบริจาค?}
  book --> reserved[ออเดอร์ reserved + ล็อต reserved + OTP]
  reserved --> cancelPath{ผู้ซื้อยกเลิก และยังไม่มี batch?}
  cancelPath -->|ใช่| reopen[ออเดอร์ cancelled ล็อตกลับ open]
  cancelPath -->|ไม่| batch[ผู้ประสานสร้างรอบ มอบหมายคนขับ]
  batch --> pickup[คนขับยืนยันรับของ กรอกน้ำหนัก]
  pickup --> weightFlag{น้ำหนักต่างจากที่แจ้งเกิน 10 เปอร์เซ็นต์?}
  weightFlag -->|ใช่| flagOn[ตั้ง weight_flag]
  weightFlag -->|ไม่| flagOff[weight_flag เป็น 0]
  flagOn --> picked[ล็อตและออเดอร์เป็น picked]
  flagOff --> picked
  picked --> dropTry[คนขับกรอก OTP ที่จุดส่ง]
  dropTry --> otpLock{otp_attempts ถึง 5?}
  otpLock -->|ใช่| locked[OTP_LOCKED ต้องให้ผู้ประสานปลดล็อก]
  locked --> unlock[coordinator unlock] --> dropTry
  otpLock -->|ยังไม่| otpOk{OTP ถูกและรับของครบแล้ว?}
  otpOk -->|ไม่| mismatch[เพิ่ม otp_attempts]
  mismatch --> dropTry
  otpOk -->|ใช่| delivered[ล็อตและออเดอร์ delivered]
  delivered --> impact[บันทึก impact_logs kg และ CO2e]
  impact --> summary[GET impact summary]
  summary --> done([จบ])
  expired --> endExpired([จบ ล็อตหมดอายุ])
  reopen --> market
```

## Swimlane 4 lane

```mermaid
flowchart TB
  subgraph Farmer["เกษตรกร farmer"]
    F0[เลือกพืชและแปลง]
    F1[ถ่ายหรือเลือกรูปให้ AI ประเมิน]
    F2[ตรวจหรือแก้ chip ความสุก]
    F3[เรียก POST lots estimate]
    F4[ดู preview อากาศและราคา]
    F5[POST lots ลงประกาศ]
    F0 --> F1 --> F2 --> F3 --> F4 --> F5
  end

  subgraph Buyer["ผู้ซื้อ buyer"]
    B1[GET market ในรัศมี]
    B2[POST orders จองหรือบริจาค]
    B3[ดู drop_otp]
    B4{ยกเลิกจอง?}
    B5[DELETE orders id]
    B1 --> B2 --> B3 --> B4
    B4 -->|ยังไม่เข้า batch| B5
  end

  subgraph Coordinator["ผู้ประสาน coordinator"]
    C1[GET batches drivers]
    C2[POST batches สร้างรอบ]
    C3[ดูจุดแวะและ weight_flag]
    C4[POST stops unlock ถ้า OTP ถูกล็อก]
    C1 --> C2 --> C3
    C3 -.-> C4
  end

  subgraph Driver["คนขับ driver"]
    D1[GET batches ของตน]
    D2[ยืนยัน pickup ด้วย weight_kg]
    D3{ต่างเกิน 10 เปอร์เซ็นต์?}
    D4[ตั้งหรือไม่ตั้ง weight_flag]
    D5[ยืนยัน drop ด้วย OTP]
    D6{ผิดครบ 5 ครั้ง?}
    D7[รอ unlock]
    D8[ส่งมอบสำเร็จ ระบบเขียน impact_logs]
    D1 --> D2 --> D3 --> D4 --> D5 --> D6
    D6 -->|ใช่| D7 --> D5
    D6 -->|ไม่และ OTP ถูก| D8
  end

  F5 --> B1
  B2 --> C2
  B5 -.->|ล็อตกลับ open| B1
  C2 --> D1
  D4 -.-> C3
  D7 -.-> C4
  C4 -.-> D5
```

## ทางแยกสำคัญ (อ้างโค้ด)

| ทางแยก | พฤติกรรมจริง | ไฟล์ |
|---|---|---|
| AI ประเมินความสุก | `POST /lots/assess-photo`; ถ้า `subject_match` เป็น false ไม่ใช้ค่าความสุก; confidence ต่ำกว่า 0.6 ตั้ง `low_confidence` | `vision.ts`, `lots.ts`, `farmer.tsx` |
| อากาศ fallback / พยากรณ์ | เฉลี่ยกลางวัน 10–17 จากพยากรณ์ 72 ชม.; ไม่สำเร็จภายใน 3 วินาที → 32°C / 75% และ `weather_source = fallback` | `openMeteo.ts`, `lots.ts` |
| ความชื้นสูงกว่า 85% | คูณอายุที่คำนวณได้ด้วย 0.9 | `shelfLife.ts` |
| ล็อตหมดอายุ | เฉพาะสถานะ `open` ที่ `expires_at <= now` ถูกตั้งเป็น `expired` ทุก 10 นาที; ล็อต `reserved` ไม่ถูก expire | `expireLots.ts` |
| ยกเลิกการจอง | ได้เมื่อออเดอร์ยัง `reserved` และ `batch_id` เป็น null; ออเดอร์ → `cancelled`, ล็อต → `open` | `orders.ts` |
| จองซ้อน | `SELECT ... FOR UPDATE` บนล็อต; ถ้าไม่ใช่ `open` ตอบ 409 `LOT_NOT_OPEN` | `orders.ts` |
| น้ำหนักต่างเกิน 10% | `abs(ชั่งได้ - ที่แจ้ง) / ที่แจ้ง > 0.1` → `weight_flag = 1` แต่ยังยืนยันรับของได้ | `confirmStop.ts` |
| OTP ผิดครบ 5 ครั้ง | `otp_attempts >= 5` → 409 `OTP_LOCKED`; ผู้ประสาน `POST /stops/:id/unlock` รีเซ็ตเป็น 0 | `confirmStop.ts`, `stops.ts` |
| Drop ก่อน pickup | ถ้ายังมีออเดอร์ในจุดส่งเป็น `reserved` → 409 `PICKUP_REQUIRED` | `confirmStop.ts` |
| บันทึก impact | ตอน drop สำเร็จ: `kg_saved` = น้ำหนักที่ยืนยันตอน pickup, `co2e_kg = kg_saved * 2.5` | `confirmStop.ts`, `seedData.ts` |
