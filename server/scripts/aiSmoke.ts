import fs from 'fs';
import path from 'path';
import { assessRipenessFromPhoto, loadVisionConfig } from '../src/ai/vision';
import { pool } from '../src/db/pool';
import type { RowDataPacket } from 'mysql2';

async function main(): Promise<void> {
  const imagePath = process.argv[2];
  const cropIdRaw = process.argv[3];
  if (imagePath === undefined || cropIdRaw === undefined) {
    console.error('usage: npm run ai:smoke -- <image-path> <crop_id>');
    process.exit(1);
  }
  const cropId = Number(cropIdRaw);
  if (!Number.isInteger(cropId) || cropId <= 0) {
    console.error('crop_id must be a positive integer');
    process.exit(1);
  }
  const absolute = path.resolve(imagePath);
  if (!fs.existsSync(absolute)) {
    console.error(`file not found: ${absolute}`);
    process.exit(1);
  }
  const lower = absolute.toLowerCase();
  const mime = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg' : null;
  if (mime === null) {
    console.error('image must be .jpg, .jpeg, or .png');
    process.exit(1);
  }

  const [rows] = await pool.query<RowDataPacket[]>('SELECT id, name_th FROM crops WHERE id = ?', [cropId]);
  const crop = rows[0];
  if (crop === undefined) {
    console.error(`crop ${cropId} not found — run migrate/seed first`);
    process.exit(1);
  }

  const config = loadVisionConfig();
  console.log(`crop=${crop.name_th} model=${config.model} base=${config.baseUrl}`);
  const imageBase64 = fs.readFileSync(absolute).toString('base64');
  const started = Date.now();
  const result = await assessRipenessFromPhoto({
    cropNameTh: String(crop.name_th),
    imageBase64,
    mime,
    config,
  });
  const elapsedMs = Date.now() - started;
  console.log(JSON.stringify(result, null, 2));
  console.log(`elapsed_ms=${elapsedMs}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
