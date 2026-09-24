# รันเดโมบนมือถือจริง (Expo Go + iPhone Hotspot)

ใช้เมื่อต้องโชว์แอปบน iPhone/Android จริง โดย Mac รัน API + Metro และมือถือเปิดผ่าน Expo Go ในเครือข่ายเดียวกัน (แนะนำ: เปิด Personal Hotspot จาก iPhone แล้วให้ Mac ต่อ Wi‑Fi ของ hotspot นั้น)

## สิ่งที่ต้องมี

- Mac รันโปรเจกต์นี้ (Node 22, MySQL 8)
- โทรศัพท์ติดตั้ง **Expo Go**
- โทรศัพท์กับ Mac อยู่เครือข่ายเดียวกัน (hotspot ของ iPhone หรือ Wi‑Fi เดียวกัน)
- บัญชี seed: รหัสผ่านทุกบัญชี `demo1234` (ดูตารางใน `README.md`)

## 1) เตรียมฐานและ API บน Mac

```bash
cd server
cp .env.example .env   # ถ้ายังไม่มี
# แก้ DB_* ให้ชี้ MySQL ของคุณ
npm install
npm run migrate
npm run seed
npm run seed:demo      # ประวัติ 14 วันสำหรับแดชบอร์ด (รันซ้ำได้)
npm run dev
```

ตรวจ log ว่าฟังที่ทุก interface:

```text
Agri-Rescue API listening on 0.0.0.0:3000
```

ถ้าเห็นแค่ `127.0.0.1` มือถือจะเรียก API ไม่ได้ — โค้ดปัจจุบัน bind ที่ `0.0.0.0` ใน `server/src/server.ts`

ทดสอบจาก Mac (login ตาม `README.md`):

```bash
curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"0800000011","password":"demo1234"}'
```

## 2) หา IP ของ Mac บนเครือข่าย hotspot / Wi‑Fi

บน Mac:

```bash
# ดู IP ของ interface ที่ต่อ hotspot (มักเป็น en0 หรือ en1)
ipconfig getifaddr en0
# ถ้าว่าง ลอง
ipconfig getifaddr en1
```

หรือ System Settings → Network → Wi‑Fi → Details → IP Address  
ตัวอย่าง: `172.20.10.2` (ช่วง IP ของ iPhone hotspot มักเป็น `172.20.10.x`)

ตรวจว่ามือถือเข้าถึงพอร์ต API ได้ (จาก Mac ใช้ IP นั้น ไม่ใช่แค่ localhost):

```bash
curl -s http://172.20.10.2:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"0800000011","password":"demo1234"}'
```

ถ้า timeout จากเครื่องอื่น: ปิด macOS Firewall ชั่วคราว หรืออนุญาต Node รับขาเข้า

## 3) ตั้ง `EXPO_PUBLIC_API_URL` แล้วสตาร์ท Expo

ในโฟลเดอร์ `mobile/` สร้างไฟล์ `.env` (ไม่ commit):

```bash
cd mobile
echo 'EXPO_PUBLIC_API_URL=http://172.20.10.2:3000' > .env
# แทนด้วย IP จริงของ Mac
npm install
npx expo start
```

สำคัญ:

- ต้อง restart Metro หลังเปลี่ยน `.env` (หยุดแล้ว `npx expo start` ใหม่)
- URL ต้องเป็น `http://` + IP + พอร์ต API **ไม่มี** slash ท้ายก็ได้ (`mobile/src/api/config.ts` ตัด `/` ให้)
- อย่าใส่ `localhost` / `127.0.0.1` ใน `.env` เมื่อรันบนเครื่องจริง — มือถือจะหมายถึงตัวเอง ไม่ใช่ Mac

สแกน QR ด้วยกล้อง / Expo Go

## 4) ลำดับเครือข่ายที่แนะนำ (iPhone hotspot)

1. บน iPhone: Settings → Personal Hotspot → เปิด Allow Others to Join  
2. บน Mac: ต่อ Wi‑Fi ชื่อ hotspot ของ iPhone  
3. หา IP ของ Mac ตามข้อ 2  
4. ตั้ง `EXPO_PUBLIC_API_URL` แล้ว `npx expo start`  
5. มือถือเปิด Expo Go (อยู่บน hotspot อยู่แล้ว)

ข้อดี: ไม่ติด captive portal / client isolation ของ Wi‑Fi สาธารณะหรือหอพัก

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุที่เป็นไปได้ | แก้ |
|---|---|---|
| Expo เปิดได้ แต่ login / ตลาด error เครือข่าย | `EXPO_PUBLIC_API_URL` ผิด หรือยังเป็น localhost | ใส่ IP Mac จริง แล้ว restart Expo |
| `Network request failed` | API ไม่ฟัง `0.0.0.0` / Firewall / คนละเครือข่าย | ตรวจ log `0.0.0.0:3000`, อนุญาต Node, ต่อ hotspot เดียวกัน |
| QR สแกนแล้วติด “Unable to connect to Metro” | มือถือหา Mac ที่พอร์ต Metro ไม่เจอ | ใช้ tunnel: `npx expo start --tunnel` (ช้ากว่า) หรือตรวจว่าอยู่ Wi‑Fi เดียวกัน |
| กราฟแดชบอร์ดว่าง | ยังไม่รัน `seed:demo` | `cd server && npm run seed:demo` |
| รูป AI ประเมินไม่ได้ | ไม่มี `AI_VISION_API_KEY` ใน `server/.env` | ใส่คีย์ตาม `README.md` หรือเดโมด้วยการเลือกความสุกมือ |
| พอร์ต 3000 ถูกใช้แล้ว | โปรเซสเก่าค้าง | ปิด `npm run dev` เดิม หรือเปลี่ยน `PORT` ให้ตรงกับ `EXPO_PUBLIC_API_URL` |
| iOS บล็อก HTTP ชัดเจน | ATS / cleartext | Expo Go ปกติอนุญาต HTTP ใน LAN; ถ้า build เองต้องตั้ง cleartext — เดโมใช้ Expo Go |

## เช็กลิสต์ก่อนขึ้นเวที

- [ ] `npm run migrate` + `seed` + `seed:demo` แล้ว  
- [ ] API log แสดง `0.0.0.0`  
- [ ] `EXPO_PUBLIC_API_URL` ชี้ IP Mac ปัจจุบัน (IP เปลี่ยนเมื่อสลับเครือข่าย)  
- [ ] Login เกษตรกร `0800000001` / ผู้ซื้อ `0800000011` / admin `0800000005` ได้จากมือถือ  
- [ ] แท็บบัญชี → แดชบอร์ด มีตัวเลขและกราฟ  
