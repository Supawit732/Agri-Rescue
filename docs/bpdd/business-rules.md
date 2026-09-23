# กฎธุรกิจ (Business Rules)

## 1) อากาศที่ใช้คำนวณ shelf-life

โค้ด: `server/src/weather/openMeteo.ts`

ระบบไม่ใช้ค่าอากาศปัจจุบัน แต่ดึงพยากรณ์รายชั่วโมง 72 ชม. (`forecast_hours=72`, `timezone=Asia/Bangkok`) แล้วใช้**ค่าเฉลี่ยช่วงกลางวัน 10:00–17:00** เป็น `temp_c` และ `humidity`

| รายการ | ค่าในโค้ด |
|---|---|
| `weather_basis` | `forecast_72h_daytime_avg` |
| ช่วงกลางวัน | ชั่วโมงท้องถิ่น 10 ถึง 17 รวมทั้งสองขอบ |
| timeout | 3 วินาที |
| fallback | 32°C / ความชื้น 75% (`PLAN_WEATHER_FALLBACK`) |
| cache | เฉพาะผล live; key = พิกัดปัด 2 ตำแหน่ง; TTL 60 นาที |

`/lots/estimate` คืน `temp_c`, `humidity`, `weather_source` (`live` \| `fallback`) และ `weather_basis`

## 2) อายุการขาย (shelf-life)

โค้ด: `server/src/domain/shelfLife.ts`

```text
base           = baseShelfDays * 24
ripeFactor     = 1 - ripeness * 0.18
heatFactor     = tempC > 30 ? max(0.6, 1 - (tempC - 30) * 0.05) : 1
humidityFactor = humidity > 85 ? 0.9 : 1
shelfHours     = max(6, round(base * ripeFactor * heatFactor * humidityFactor))
```

- `ripeness` เป็นจำนวนเต็ม 0–4 (ดิบ → ใกล้งอม)
- ความชื้น**มากกว่า 85%** ลดอายุลงอีก 10% (เท่ากับ 85% ไม่ลด) — เหตุผลใน `DECISIONS.md` D014
- `tempC` / `humidity` คือค่าเฉลี่ยกลางวันจากข้อ 1 (หรือค่า fallback)

### ตัวอย่างจาก `phase2Samples` (มะม่วง `baseShelfDays = 5`)

| ripeness | tempC | humidity | คำนวณ | shelfHours |
|---|---|---|---|---|
| 2 | 34 | 78 | base 120; ripe 0.64; heat 0.8; humidity 1 → 61.44 → **61** | 61 |
| 3 | 34 | 78 | ripe 0.46; 120 × 0.46 × 0.8 = 44.16 → **44** | 44 |
| 2 | 34 | 90 | เช่นเดียวกับแถวแรกแล้ว × 0.9 → 54.9 → **55** | **55** |

เทสยืนยัน: `server/tests/domain/shelfLife.test.ts` (humidity 85 → 61; 85.1 / 90 → 55)

## 3) ราคาด่วนต่อกิโลกรัม

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

## 4) CO₂e และสรุปผลลัพธ์

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
