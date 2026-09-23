# กฎธุรกิจ (Business Rules)

## 1) อายุการขาย (shelf-life)

โค้ด: `server/src/domain/shelfLife.ts`

```text
base        = baseShelfDays * 24
ripeFactor  = 1 - ripeness * 0.18
heatFactor  = tempC > 30 ? max(0.6, 1 - (tempC - 30) * 0.05) : 1
shelfHours  = max(6, round(base * ripeFactor * heatFactor))
```

- `ripeness` เป็นจำนวนเต็ม 0–4 (ดิบ → ใกล้งอม)
- ถ้าอากาศเรียกไม่สำเร็จ ระบบใช้ค่าสำรอง **32°C / ความชื้น 75%** (`PLAN_WEATHER_FALLBACK`)

### ตัวอย่างจาก `phase2Samples` (มะม่วง `baseShelfDays = 5`, อุณหภูมิ 34°C)

| ripeness | คำนวณ | shelfHours ในโค้ด |
|---|---|---|
| 2 | base = 120; ripeFactor = 1 − 0.36 = 0.64; heatFactor = max(0.6, 1 − 0.2) = 0.8; 120 × 0.64 × 0.8 = 61.44 → round **61** | 61 |
| 3 | ripeFactor = 1 − 0.54 = 0.46; 120 × 0.46 × 0.8 = 44.16 → round **44** | 44 |

เทสยืนยัน: `server/tests/domain/shelfLife.test.ts`

## 2) ราคาด่วนต่อกิโลกรัม

โค้ด: `server/src/domain/pricing.ts` ฟังก์ชัน `urgentPricePerKg`

```text
freshness   = baseShelfHours <= 0 ? 0 : clamp(hoursLeft / baseShelfHours, 0, 1)
gradeFactor = grade === 'substandard' ? 0.7 : 1
price       = max(5, round(marketPricePerKg * (0.3 + 0.7 * freshness) * gradeFactor))
```

ราคาขั้นต่ำคือ **5 บาท/กก.**

### ตัวอย่างจาก `phase2Samples[0]`

มะม่วง `marketPricePerKg = 40`, `baseShelfHours = 120`, `hoursLeft = 61`, `grade = normal`

```text
freshness = 61 / 120 ≈ 0.5083
price     = round(40 * (0.3 + 0.7 * 0.5083)) = round(26.232) = 26
```

ตรงกับ `priceNormal: 26` ใน `phase2Samples` และ `pricing.test.ts`

ตัวอย่างเกรดตกเกรดที่ชั่วโมงเดียวกัน: `round(26.232 * 0.7) = 18` (ยืนยันในเทส)

ตอน**จอง**ระบบคำนวณใหม่จาก `hoursLeft` ที่เหลือถึง `expires_at`  
ตอน**บริจาค** (`donation = true` และเงื่อนไข charity / `allow_donation` ผ่าน) ตั้ง `agreed_price_per_kg = 0`

## 3) CO₂e และสรุปผลลัพธ์

ค่าคงที่: `CO2E_PER_KG = 2.5` ใน `seedData.ts`

ตอนส่งมอบสำเร็จ (`confirmDrop`):

```text
kg_saved = confirmed_weight_kg จากจุด pickup ของล็อตนั้น
co2e_kg  = round2(kg_saved * 2.5)
```

บันทึกลง `impact_logs` หนึ่งแถวต่อหนึ่งออเดอร์

`GET /api/impact/summary` รวมจากทุกแถว:

| ฟิลด์ | วิธีคิด |
|---|---|
| `kg_saved` | ผลรวม `impact_logs.kg_saved` |
| `co2e_kg` | ผลรวม `impact_logs.co2e_kg` |
| `farmer_income` | ผลรวม `agreed_price_per_kg × kg_saved` เฉพาะออเดอร์ที่ `is_donation = 0` |
| `donated_kg` | ผลรวม `kg_saved` ของออเดอร์ `is_donation = 1` |
| `lot_count` | จำนวนแถวใน `impact_logs` |

### ตัวอย่างตัวเลข

รับของชั่งได้ 80 กก. แล้วส่งมอบสำเร็จ → `co2e_kg = round2(80 × 2.5) = 200.00`  
ถ้าออเดอร์ราคา 18 บาท/กก. รายได้เกษตรกรจากออเดอร์นี้ = `18 × 80 = 1440` บาท
