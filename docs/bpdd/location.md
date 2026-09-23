# พิกัดตำแหน่ง (Location)

อ้างอิง: `mobile/src/components/LocationPicker.tsx`, `mobile/src/geo/mapsLink.ts`, `server/src/routes/geo.ts`, `server/src/geo/resolveLink.ts`, `server/src/geo/nominatim.ts`, `server/src/middleware/geoRateLimit.ts`

`LocationPicker` ใช้ตอนสมัครผู้ซื้อและตอนระบุพิกัดแปลง/ผู้ใช้ที่ต้องมี lat/lng จริงในระบบ

## วิธีได้พิกัด 3 แบบ

| แบบ | การทำงาน | โค้ด |
|---|---|---|
| 1. GPS บนเครื่อง | ขอสิทธิ์ตำแหน่งแล้วเรียก `getCurrentPositionAsync` (Accuracy.Balanced) | `LocationPicker.tsx` |
| 2. วางลิงก์ Google Maps | ถอดพิกัดจาก URL ฝั่งไคลเอนต์ถ้าเป็นลิงก์เต็ม; ถ้าเป็นลิงก์สั้น (`goo.gl` / `maps.app.goo.gl` / host google ที่ allow) ส่ง `POST /api/geo/resolve-link` ให้เซิร์ฟเวอร์ตาม redirect แล้วอ่านพิกัด | `mapsLink.ts`, `resolveLink.ts` |
| 3. กรอกเอง | เปิด “แก้พิกัดเอง” กรอกละติจูด/ลองจิจูดเป็นตัวเลข | `LocationPicker.tsx` |

หลังได้พิกัด แอปอาจเรียก `GET /api/geo/reverse?lat=&lng=` เพื่อแสดงชื่อที่อยู่ (Nominatim) และเตือนถ้าอยู่นอกกรอบคร่าว ๆ ของไทย (lat 5–21, lng 97–106)

## การป้องกัน SSRF ตอน resolve ลิงก์

`resolveMapsLink` (`server/src/geo/resolveLink.ts`)

- อนุญาตเฉพาะ `http` / `https`
- host ต้องอยู่ใน allowlist ของ Google Maps เท่านั้น (`maps.app.goo.gl`, `goo.gl`, `maps.google.com`, `google.com`, `google.co.th` และ www เทียบเท่า)
- บล็อก localhost, `*.local`, IPv4 literal, และ host ที่มี `:` (IPv6)
- ตาม redirect แบบ manual สูงสุด 5 ครั้ง; timeout 5 วินาทีต่อคำขอ
- ไม่พบพิกัดใน URL สุดท้าย → 422 `COORDS_NOT_FOUND`

เทส: `server/tests/geo/resolveLink.test.ts`, `server/tests/api/geo.test.ts`

## Rate limit

`geoRateLimit` ครอบทุก `/api/geo/*`

| พารามิเตอร์ | ค่า |
|---|---|
| หน้าต่างเวลา | 60 วินาที |
| สูงสุดต่อ IP | 20 คำขอ |
| เมื่อเกิน | 429 `RATE_LIMIT` |

นอกจากนี้ reverse geocode จำกัดการยิง Nominatim ไม่เกิน 1 ครั้งต่อวินาที และ cache ผล 24 ชม. โดย key พิกัดปัด 4 ตำแหน่ง

## Endpoint สรุป

| Method | Path | Auth | หน้าที่ |
|---|---|---|---|
| POST | `/api/geo/resolve-link` | ไม่บังคับ (มี rate limit) | ถอดพิกัดจากลิงก์ Maps |
| GET | `/api/geo/reverse` | ไม่บังคับ (มี rate limit) | ชื่อที่อยู่จาก lat/lng |
