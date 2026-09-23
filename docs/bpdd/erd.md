# ERD

สคีมาจาก `server/src/db/migrations/001_init.sql` และ `002_otp_attempts.sql`  
ความสัมพันธ์ด้านล่างเป็น**เชิงตรรกะในแอป** ไม่มี `FOREIGN KEY` / `REFERENCES` ใน SQL

```mermaid
erDiagram
  users ||--o{ plots : "farmer_id"
  users ||--o{ orders : "buyer_id"
  users ||--o{ batches : "driver_id"
  users ||--o{ route_stops : "buyer_id"
  crops ||--o{ harvest_lots : "crop_id"
  plots ||--o{ harvest_lots : "plot_id"
  harvest_lots ||--o{ quality_assessments : "lot_id"
  harvest_lots ||--o{ orders : "lot_id"
  harvest_lots ||--o{ route_stops : "lot_id"
  batches ||--o{ orders : "batch_id"
  batches ||--o{ route_stops : "batch_id"
  orders ||--o| impact_logs : "order_id"

  users {
    int id PK
    varchar name
    varchar phone UK
    varchar password_hash
    enum role
    enum buyer_type
    double lat
    double lng
    datetime created_at
  }

  crops {
    int id PK
    varchar name_th
    int base_shelf_days
    decimal market_price_per_kg
  }

  plots {
    int id PK
    int farmer_id
    varchar name
    double lat
    double lng
    decimal area_rai
  }

  harvest_lots {
    int id PK
    int plot_id
    int crop_id
    decimal weight_kg
    enum grade
    tinyint ripeness
    varchar photo_url
    tinyint allow_donation
    int predicted_shelf_hours
    datetime expires_at
    enum status
    datetime created_at
  }

  quality_assessments {
    int id PK
    int lot_id
    enum method
    tinyint ripeness
    decimal temp_c
    decimal humidity
    int predicted_shelf_hours
    tinyint ai_ripeness
    decimal ai_confidence
    varchar ai_model
    datetime created_at
  }

  batches {
    int id PK
    int driver_id
    enum status
    decimal planned_km
    datetime created_at
  }

  orders {
    int id PK
    int lot_id
    int buyer_id
    decimal agreed_price_per_kg
    tinyint is_donation
    enum status
    int batch_id
    char drop_otp
    datetime created_at
  }

  route_stops {
    int id PK
    int batch_id
    int seq
    enum stop_type
    int lot_id
    int buyer_id
    double lat
    double lng
    decimal leg_km
    enum status
    decimal confirmed_weight_kg
    varchar proof_photo_url
    tinyint weight_flag
    datetime confirmed_at
    int otp_attempts
  }

  impact_logs {
    int id PK
    int order_id UK
    decimal kg_saved
    decimal co2e_kg
    datetime created_at
  }
```

คอลัมน์ `otp_attempts` ถูกเพิ่มใน migration `002_otp_attempts.sql`  
คอลัมน์ `ai_ripeness`, `ai_confidence`, `ai_model` ถูกเพิ่มใน migration `003_ai_assessment.sql`

## ทำไมไม่มี FOREIGN KEY constraint

จาก `docs/IMPLEMENTATION_PLAN.md` ข้อจำกัดของวิชา:

> ห้ามใช้ FOREIGN KEY constraint และ VIEW ในฐานข้อมูล (เซิร์ฟเวอร์ของวิชาไม่ให้สิทธิ์ REFERENCES / CREATE VIEW)

ดังนั้น migration ใส่เฉพาะ **PRIMARY KEY / UNIQUE / INDEX** บนคอลัมน์ที่อ้างอิงตารางอื่น เช่น `idx_plots_farmer_id`, `idx_orders_lot_id`, `uq_impact_logs_order_id`

## บังคับ integrity ใน service แทน

| กฎเชิงตรรกะ | บังคับที่ |
|---|---|
| แปลงต้องเป็นของเกษตรกรที่ login | `lots.ts` / `plots.ts` ตรวจ `farmer_id` |
| จองได้เฉพาะล็อต `open` ที่ยังไม่หมดอายุ | `orders.ts` + `SELECT ... FOR UPDATE` |
| ออเดอร์ผูกคนซื้อที่ login | `orders.ts` ตรวจ `buyer_id` |
| คนขับยืนยันได้เฉพาะรอบของตน | `confirmStop.ts`, `batches.ts` เทียบ `driver_id` |
| สถานะล็อตเปลี่ยนได้เฉพาะคู่ที่อนุญาต | `assertLotTransition` |
| หนึ่งออเดอร์มี impact ได้ครั้งเดียว | `UNIQUE (order_id)` บน `impact_logs` |
| คนขับ/พิกัดผู้ซื้อต้องมีก่อนสร้างรอบ | `createBatch.ts` ตรวจ role และ lat/lng |

ตาราง `schema_migrations` ถูกสร้างโดย `migrate.ts` เพื่อจำไฟล์ migration ที่รันแล้ว ไม่ได้อยู่ในไฟล์ `.sql` ของชุดนี้ จึงไม่ใส่ในแผนภาพด้านบน
