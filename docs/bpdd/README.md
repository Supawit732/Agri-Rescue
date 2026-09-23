# เอกสาร BPDD — Agri-Rescue

เอกสารชุดนี้สรุปธุรกิจ กระบวนการ ข้อมูล และการควบคุมภายในของระบบ Agri-Rescue โดยอ้างอิงจากโค้ดและสคีมาจริงใน repository นี้เท่านั้น ไม่ได้อ้างฟีเจอร์ที่ระบบยังไม่ได้ทำ

## สารบัญ

1. [ภาพรวมระบบ](overview.md) — ปัญหา กลุ่มเป้าหมาย จุดต่างจาก e-commerce ผักทั่วไป ขอบเขตและนอกขอบเขต
2. [ผู้มีส่วนร่วม (Actors)](actors.md) — 4 role หน้าที่ สิ่งที่ทำได้/ทำไม่ได้ จาก `requireRole`
3. [กระบวนการธุรกิจ](business-flow.md) — flowchart ภาพรวม และ swimlane 4 lane (Mermaid)
4. [แผนภาพสถานะ](state-diagram.md) — สถานะล็อตจาก `lotStateMachine` และสถานะออเดอร์จาก service
5. [ERD](erd.md) — `erDiagram` จากไฟล์ migrations
6. [พจนานุกรมข้อมูล](data-dictionary.md) — ทุกตาราง ทุกคอลัมน์
7. [การทำให้เป็นบรรทัดฐาน](normalization.md) — UNF → 1NF → 2NF → 3NF จากใบสรุปรอบวิ่ง
8. [กฎธุรกิจ](business-rules.md) — สูตร shelf-life ราคาด่วน CO₂e พร้อมตัวอย่างจาก `phase2Samples`
9. [การควบคุมภายใน](internal-controls.md) — ความเสี่ยง → control → โค้ด → เทส

## แหล่งอ้างอิงหลักในโค้ด

| หัวข้อ | ที่อยู่ |
|---|---|
| สิทธิ์ตาม role | `server/src/middleware/auth.ts`, `server/src/routes/*.ts` |
| สถานะล็อต | `server/src/domain/lotStateMachine.ts` |
| สคีมา | `server/src/db/migrations/001_init.sql`, `002_otp_attempts.sql` |
| สูตรธุรกิจ | `server/src/domain/shelfLife.ts`, `pricing.ts`, `server/src/db/seedData.ts` |
| ยืนยันจุดแวะ / impact | `server/src/delivery/confirmStop.ts`, `impactSummary.ts` |
| หมดอายุล็อต | `server/src/jobs/expireLots.ts` |
