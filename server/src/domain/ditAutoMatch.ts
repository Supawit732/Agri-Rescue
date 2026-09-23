import {
  compareDitSuggestions,
  isExcludedDitProductName,
  isProcessedDitProductName,
  normalizeMocProductName,
  type DitProductCandidate,
} from './ditSuggest';

export type DitMatchDecision = 'selected' | 'rejected';

export type DitMatchReason =
  | 'selected_wholesale_kg'
  | 'selected_wholesale_unit_pending'
  | 'selected_retail_kg'
  | 'selected_retail_unit_pending'
  | 'no_name_match'
  | 'excluded_store_organic'
  | 'excluded_processed'
  | 'category_mismatch'
  | 'unit_not_kg'
  | 'ranked_below_top';

export interface DitMatchDiagnosis {
  product_id: string;
  product_name: string;
  category_name: string | null;
  sell_type: string | null;
  unit: string;
  decision: DitMatchDecision;
  reason: DitMatchReason;
  reason_th: string;
}

const FRUIT_HINT = /มะม่วง|กล้วย|ทุเรียน|ส้ม|เงาะ|ลำไย|ลิ้นจี่|สับปะรด|แตงโม|ฝรั่ง|น้อยหน่า|มังคุด|ลองกอง/;
/** Lime is listed under ผักสด in the MOC catalog (not ผลไม้). */
const VEG_HINT = /ผักบุ้ง|มะเขือเทศ|มะนาว|กะหล่ำ|หอมหัวใหญ่|หอมแดง|ผักกาด|คะน้า|แตงกวา|พริก|ผักชี|ต้นหอม/;

/** Expected MOC category_name values for a crop. */
export function expectedMocCategories(cropNameTh: string): string[] {
  const n = normalizeMocProductName(cropNameTh);
  if (VEG_HINT.test(n) && !FRUIT_HINT.test(n)) {
    return ['ผักสด'];
  }
  if (FRUIT_HINT.test(n)) {
    return ['ผลไม้'];
  }
  // Unknown crop family — allow common fresh-produce categories only.
  return ['ผลไม้', 'ผักสด'];
}

export function categoryMatchesCrop(cropNameTh: string, categoryName: string | null): boolean {
  if (categoryName === null || categoryName.trim() === '') {
    return false;
  }
  const expected = expectedMocCategories(cropNameTh);
  return expected.some((cat) => categoryName === cat || categoryName.includes(cat));
}

const REASON_TH: Record<DitMatchReason, string> = {
  selected_wholesale_kg: 'เลือก: ขายส่ง หน่วย กก. (จากชื่อ)',
  selected_wholesale_unit_pending: 'เลือก: ขายส่ง — หน่วยจะยืนยันจากราคา',
  selected_retail_kg: 'เลือก: ไม่มีขายส่งที่ผ่าน — ใช้ขายปลีก กก.',
  selected_retail_unit_pending: 'เลือก: ไม่มีขายส่งที่ผ่าน — ใช้ขายปลีก (หน่วยยืนยันจากราคา)',
  no_name_match: 'ตัด: ชื่อสินค้าไม่มีชื่อพืช',
  excluded_store_organic: 'ตัด: อินทรีย์/ร้าน/ห้าง',
  excluded_processed: 'ตัด: ของแปรรูป/แห้ง/ดอง ฯลฯ',
  category_mismatch: 'ตัด: หมวดไม่ตรงพืช',
  unit_not_kg: 'ตัด: หน่วยในชื่อไม่ใช่ กก.',
  ranked_below_top: 'ตัด: ไม่ใช่อันดับ 1 หลังเรียงลำดับ',
};

function reject(
  p: DitProductCandidate,
  reason: DitMatchReason,
): DitMatchDiagnosis {
  return {
    product_id: p.product_id,
    product_name: p.product_name,
    category_name: p.category_name,
    sell_type: p.sell_type,
    unit: p.unit,
    decision: 'rejected',
    reason,
    reason_th: REASON_TH[reason],
  };
}

/** All catalog rows whose name contains the crop name, with accept/reject reasons. */
export function diagnoseDitMatch(
  cropNameTh: string,
  products: DitProductCandidate[],
): DitMatchDiagnosis[] {
  const needle = normalizeMocProductName(cropNameTh);
  if (needle === '') {
    return [];
  }
  const named = products.filter((p) => p.product_id !== '' && p.product_name.includes(needle));
  const rows: DitMatchDiagnosis[] = [];
  const eligible: DitProductCandidate[] = [];

  for (const p of named) {
    if (isExcludedDitProductName(p.product_name)) {
      rows.push(reject(p, 'excluded_store_organic'));
      continue;
    }
    if (isProcessedDitProductName(p.product_name)) {
      rows.push(reject(p, 'excluded_processed'));
      continue;
    }
    if (!categoryMatchesCrop(cropNameTh, p.category_name)) {
      rows.push(reject(p, 'category_mismatch'));
      continue;
    }
    // Name parentheses are a fallback only — unknown is allowed; confirmed non-kg is not.
    if (p.unit !== 'กก.' && p.unit !== 'unknown') {
      rows.push(reject(p, 'unit_not_kg'));
      continue;
    }
    eligible.push(p);
  }

  const wholesale = eligible.filter((p) => p.sell_type === 'ขายส่ง').sort(compareDitSuggestions);
  const retail = eligible.filter((p) => p.sell_type === 'ขายปลีก').sort(compareDitSuggestions);
  // Prefer wholesale (any pending/kg). If none pass, try retail — prefer known กก. then pending.
  const retailKg = retail.filter((p) => p.unit === 'กก.');
  const pickList =
    wholesale.length > 0 ? wholesale : retailKg.length > 0 ? retailKg : retail;
  const pick = pickList[0];
  let pickReason: DitMatchReason = 'selected_retail_unit_pending';
  if (pick !== undefined) {
    if (wholesale.length > 0) {
      pickReason = pick.unit === 'กก.' ? 'selected_wholesale_kg' : 'selected_wholesale_unit_pending';
    } else if (pick.unit === 'กก.') {
      pickReason = 'selected_retail_kg';
    }
  }
  for (const p of eligible) {
    if (pick !== undefined && p.product_id === pick.product_id) {
      rows.push({
        product_id: p.product_id,
        product_name: p.product_name,
        category_name: p.category_name,
        sell_type: p.sell_type,
        unit: p.unit,
        decision: 'selected',
        reason: pickReason,
        reason_th: REASON_TH[pickReason],
      });
    } else {
      rows.push(reject(p, 'ranked_below_top'));
    }
  }

  return rows.sort((a, b) => {
    if (a.decision !== b.decision) {
      return a.decision === 'selected' ? -1 : 1;
    }
    return a.product_id.localeCompare(b.product_id);
  });
}

/**
 * Auto-match: wholesale กก. first, else retail กก.
 * Requires name substring, category match, not store/organic/processed.
 */
export function pickAutoDitMatch(
  cropNameTh: string,
  products: DitProductCandidate[],
): DitProductCandidate | null {
  const selected = diagnoseDitMatch(cropNameTh, products).find((d) => d.decision === 'selected');
  if (selected === undefined) {
    return null;
  }
  return (
    products.find((p) => p.product_id === selected.product_id) ?? {
      product_id: selected.product_id,
      product_name: selected.product_name,
      sell_type: selected.sell_type,
      category_name: selected.category_name,
      unit: selected.unit,
    }
  );
}
