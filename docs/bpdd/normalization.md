# การทำให้เป็นบรรทัดฐาน (Normalization)

ตัวอย่างใช้**ใบสรุปรอบวิ่งหนึ่งรอบ** ซึ่งเป็นเอกสารทางธุรกิจที่ผู้ประสาน/คนขับดูได้จากข้อมูล batch + stops + ออเดอร์ + ล็อต  
เป้าหมายคือแสดงว่าสคีมาปัจจุบันอยู่ใน **3NF**

ตัวเลขตัวอย่างสมมติให้เข้าใจขั้นตอน แต่โครงสร้างคอลัมน์สุดท้ายตรงกับตารางใน migrations

## UNF — ใบสรุปรอบวิ่ง (เอกสารดิบ)

หนึ่งแถวต่อหนึ่งรอบ มีกลุ่มข้อมูลซ้ำในจุดแวะ

| batch_id | driver_name | driver_phone | planned_km | batch_status | stops (repeating group) |
|---|---|---|---|---|---|
| 1 | คนขับตัวอย่าง | 0800000004 | 12.35 | planned | (1, pickup, ลุงสมชาย, มะม่วง, 80kg, substandard, แปลงลุงสมชาย, 13.668, 100.628, 3.2km); (2, drop, รถพุ่มพวงป้าแดง, 0800000011, vendor, OTP 0427, ราคา 18, 13.662, 100.611, 4.1km) |

ปัญหา: มี repeating group, ค่าซ้ำของคนขับ/พืช/ผู้ซื้อปนในแถวเดียว

## 1NF — กำจัด repeating group

แยกหนึ่งแถวต่อหนึ่งจุดแวะ ทุกคอลัมน์เป็นค่าอะตอม

| batch_id | driver_name | driver_phone | planned_km | batch_status | seq | stop_type | farmer_name | crop_name_th | weight_kg | grade | plot_name | stop_lat | stop_lng | leg_km | buyer_name | buyer_phone | buyer_type | drop_otp | agreed_price_per_kg |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | คนขับตัวอย่าง | 0800000004 | 12.35 | planned | 1 | pickup | ลุงสมชาย | มะม่วง | 80 | substandard | แปลงลุงสมชาย | 13.668 | 100.628 | 3.20 | | | | | |
| 1 | คนขับตัวอย่าง | 0800000004 | 12.35 | planned | 2 | drop | | | | | | 13.662 | 100.611 | 4.10 | รถพุ่มพวงป้าแดง | 0800000011 | vendor | 0427 | 18 |

ยังมี anomaly: เปลี่ยนเบอร์คนขับต้องแก้หลายแถว; ชื่อพืชซ้ำทุก pickup ของพืชเดียวกัน

## 2NF — กำจัด partial dependency

คีย์คอมโพสิตของแถวจุดแวะคือ `(batch_id, seq)`  
คุณสมบัติของรอบ (`driver_*`, `planned_km`, `batch_status`) พึ่ง `batch_id` อย่างเดียว → แยกตารางรอบ  
คุณสมบัติของจุดแวะพึ่ง `(batch_id, seq)`

**batches_2nf**

| batch_id | driver_id | planned_km | status |
|---|---|---|---|
| 1 | 4 | 12.35 | planned |

**route_stops_2nf**

| batch_id | seq | stop_type | lot_id | buyer_id | lat | lng | leg_km |
|---|---|---|---|---|---|---|---|
| 1 | 1 | pickup | 1 | NULL | 13.668 | 100.628 | 3.20 |
| 1 | 2 | drop | NULL | 11 | 13.662 | 100.611 | 4.10 |

**users_2nf** (คนขับ/ผู้ซื้อ/เกษตรกร)

| id | name | phone | role | buyer_type |
|---|---|---|---|---|
| 4 | คนขับตัวอย่าง | 0800000004 | driver | NULL |
| 11 | รถพุ่มพวงป้าแดง | 0800000011 | buyer | vendor |
| 1 | ลุงสมชาย | 0800000001 | farmer | NULL |

ยังมี transitive dependency เช่น `crop_name_th` พึ่ง `crop_id` ของล็อต ไม่ใช่พึ่ง stop โดยตรง

## 3NF — กำจัด transitive dependency

แยก entity ที่ไม่ขึ้นกับคีย์ของแถวโดยตรง

| ตาราง 3NF (ตรงสคีมาจริง) | เหตุที่แยก |
|---|---|
| `users` | ชื่อ/เบอร์/role พึ่ง `users.id` |
| `crops` | ชื่อพืช ราคาตลาด อายุฐาน พึ่ง `crops.id` |
| `plots` | ชื่อแปลง พิกัด พึ่ง `plots.id` และอ้าง `farmer_id` |
| `harvest_lots` | น้ำหนัก เกรด ความสุก สถานะ พึ่ง `harvest_lots.id` อ้าง plot/crop |
| `orders` | ราคาตกลง OTP สถานะออเดอร์ พึ่ง `orders.id` อ้าง lot/buyer/batch |
| `batches` | ระยะรวม สถานะรอบ คนขับ พึ่ง `batches.id` |
| `route_stops` | ลำดับ ประเภทจุด ระยะขา พึ่ง `route_stops.id` อ้าง batch/lot/buyer |
| `quality_assessments` | ผลประเมินอากาศ/shelf-life ของล็อต |
| `impact_logs` | ผลลัพธ์หลังส่งมอบ พึ่ง `order_id` |

ผลลัพธ์: ไม่มี non-key attribute ที่พึ่ง non-key อื่น → **สคีมา Agri-Rescue อยู่ใน 3NF**  
การไม่มี FK constraint ไม่ได้ทำให้หลุดจาก 3NF เพราะ 3NF พูดถึงการพึ่งพาเชิงฟังก์ชันของแอตทริบิวต์ ส่วน FK เป็นกลไกบังคับที่ชั้นฐานข้อมูล ซึ่งวิชาให้ย้ายไปบังคับใน service แทน
