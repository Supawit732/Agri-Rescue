# การประเมินความสุกจากภาพ (AI Assessment)

อ้างอิง: `server/src/ai/vision.ts`, `server/src/routes/lots.ts`, `mobile/app/farmer.tsx`, migration `003_ai_assessment.sql`

## โมเดลและ endpoint

ใช้ API แบบ **OpenAI-compatible** `POST {base}/chat/completions` ไม่ผูกกับผู้ให้บริการรายใดรายหนึ่ง

| ตัวแปร | ความหมาย | ค่าเริ่มต้นเมื่อว่าง |
|---|---|---|
| `AI_VISION_BASE_URL` | ฐาน URL | `https://opencode.ai/zen/go/v1` |
| `AI_VISION_API_KEY` | Bearer token | (ว่าง = ประเมินภาพไม่พร้อม) |
| `AI_VISION_MODEL` | ชื่อโมเดล | `mimo-v2.6-flash` |

ข้อจำกัด: รูป jpeg/png ถอด base64 ได้ไม่เกิน 5MB; timeout 20 วินาที  
ส่งรูปเป็น `image_url` แบบ data URI พร้อม `response_format` ชนิด `json_schema` (ชื่อ `ripeness_assessment`) และ `thinking: { type: "disabled" }`  
ถ้าได้ HTTP 400 เพราะไม่รองรับพารามิเตอร์ ให้ retry ครั้งเดียวโดยตัดพารามิเตอร์นั้นออก

## Prompt (สรุป)

Prompt ภาษาไทยระบุว่า

- ประเมินความสุกของพืชที่เลือก (`crop.name_th`)
- ระดับ 0–4 ตาม `RIPENESS_LABELS`: ดิบ, เริ่มสุก, สุกพอดี, สุกมาก, ใกล้งอม
- ตั้ง `subject_match = true` เฉพาะเมื่อในรูปเห็นพืชชนิดนั้นชัดเจน มิฉะนั้นเป็น `false`
- ตอบ JSON เท่านั้นตามสคีมาด้านล่าง

## Schema ที่บังคับ

```json
{
  "subject_match": true,
  "ripeness": 0,
  "confidence": 0.0,
  "defects": ["ตำหนิภาษาไทย"],
  "note_th": "คำอธิบายสั้นภาษาไทย"
}
```

validate ด้วย zod หลังดึง JSON จากคำตอบ (รองรับ code fence \`\`\`json)

## ผลลัพธ์ที่ API คืนให้แอป

| กรณี | รูปตอบ |
|---|---|
| สำเร็จและรูปตรงพืช | `{ available: true, subject_match: true, ripeness, confidence, defects, note_th, low_confidence, model }` |
| รูปไม่ตรงพืช | `{ available: true, subject_match: false }` — **ไม่ใช้ค่าความสุก** |
| ไม่พร้อมใช้ | `{ available: false, reason }` เช่น ไม่มี key, timeout, JSON เสีย, รูปใหญ่เกิน 5MB |

`low_confidence = confidence < 0.6` (แอปแสดงว่า AI ไม่แน่ใจ ให้ตรวจระดับความสุกเอง)

## เกษตรกรแก้ค่าได้

บนหน้าลงล็อต หลัง AI เลือก chip ความสุกให้ เกษตรกรแก้ chip ได้เสมอ

- ยังใช้ค่าเดียวกับ AI → ป้าย “ประเมินโดย AI”
- แก้แล้ว → ป้าย “แก้โดยเกษตรกร”

ตอน `POST /lots` ส่ง `ripeness` (ค่าที่ใช้จริง) คู่กับ `ai_ripeness` / `ai_confidence` / `ai_model` (ถ้ามีการประเมินสำเร็จและ `subject_match`)

## การบันทึกเพื่อวัดความแม่นยำ

ตาราง `quality_assessments` (migration 003):

| คอลัมน์ | ความหมาย |
|---|---|
| `ripeness` | ค่าที่ลงประกาศจริง (หลังเกษตรกรยืนยันหรือแก้) |
| `ai_ripeness` | ค่าที่โมเดลเสนอ |
| `ai_confidence` | ความมั่นใจ 0–1 |
| `ai_model` | ชื่อโมเดลที่ใช้ |
| `method` | `model` ถ้ามีค่า AI และ `ai_ripeness === ripeness`; ไม่เช่นนั้น `rule` |

การเทียบ `ai_ripeness` กับ `ripeness` ในแถวเดียวกันใช้วิเคราะห์ความแม่นยำย้อนหลังได้โดยไม่ต้องมีตารางแยก

สคริปต์ทดสอบมือ: `npm run ai:smoke -- <path-รูป> <crop_id>` (เรียก vision API จริง)
