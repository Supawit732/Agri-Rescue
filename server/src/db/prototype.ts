import fs from 'fs';
import path from 'path';

export interface PrototypeCrop {
  nameTh: string;
  baseShelfDays: number;
  marketPricePerKg: number;
}

export interface PrototypeBuyer {
  name: string;
  phone: string | null;
  buyerType: 'vendor' | 'shop' | 'charity';
  lat: number | null;
  lng: number | null;
}

export interface PrototypePlot {
  name: string;
  lat: number;
  lng: number;
  areaRai: number | null;
}

export interface PrototypeLot {
  cropName: string;
  plotName: string | null;
  weightKg: number;
  grade: 'normal' | 'substandard';
  ripeness: number;
  allowDonation: boolean;
  photoUrl: string | null;
  tempC: number | null;
  humidity: number | null;
  shelfHours: number | null;
  lat: number | null;
  lng: number | null;
  areaRai: number | null;
  createdAt: string | null;
}

export interface PrototypeUser {
  name: string;
  phone: string | null;
  role: 'farmer' | 'buyer' | 'driver' | 'coordinator';
  buyerType: 'vendor' | 'shop' | 'charity' | null;
  lat: number | null;
  lng: number | null;
}

export interface PrototypeData {
  colors: Record<string, unknown>;
  crops: PrototypeCrop[];
  buyers: PrototypeBuyer[];
  plots: PrototypePlot[];
  lots: PrototypeLot[];
  users: PrototypeUser[];
}

const PROTOTYPE_PATH = path.resolve(__dirname, '../../../docs/prototype/App.js');

export function prototypePath(): string {
  return PROTOTYPE_PATH;
}

export function loadPrototype(): PrototypeData {
  const source = fs.readFileSync(PROTOTYPE_PATH, 'utf8');
  const constants = collectConstants(source);
  const colors = constants.get('C');
  if (!isRecord(colors)) {
    throw new Error('Prototype is missing a literal `const C = { ... }` palette');
  }

  const crops = uniqueBy(collectCrops(constants), (crop) => crop.nameTh);
  const users = collectUsers(constants);
  const buyersFromUsers = users
    .filter((user) => user.role === 'buyer' && user.buyerType !== null)
    .map((user) => ({
      name: user.name,
      phone: user.phone,
      buyerType: user.buyerType as 'vendor' | 'shop' | 'charity',
      lat: user.lat,
      lng: user.lng,
    }));
  const buyers = uniqueBy(
    buyersFromUsers.length > 0 ? buyersFromUsers : collectBuyers(constants),
    (buyer) => `${buyer.buyerType}:${buyer.name}`,
  );
  const plots = collectPlots(constants);
  const lots = collectLots(constants, crops);

  if (crops.length !== 5) {
    throw new Error(`Expected 5 crops from the prototype, found ${crops.length}: ${crops.map((crop) => crop.nameTh).join(', ')}`);
  }
  if (buyers.length !== 3) {
    throw new Error(`Expected 3 buyers from the prototype, found ${buyers.length}: ${buyers.map((buyer) => buyer.name).join(', ')}`);
  }
  if (lots.length !== 3) {
    throw new Error(`Expected 3 lots from the prototype, found ${lots.length}`);
  }

  return { colors, crops, buyers, plots, lots, users };
}

function collectCrops(constants: Map<string, unknown>): PrototypeCrop[] {
  const found: PrototypeCrop[] = [];
  walk(constants, (value) => {
    if (!isRecord(value)) {
      return;
    }
    if (gradeOf(value) !== null && numberField(value, ['weightKg', 'weight_kg', 'kg', 'weight']) !== null) {
      return;
    }
    const nameTh = stringField(value, ['nameTh', 'name_th', 'name', 'crop', 'title', 'label']);
    const baseShelfDays = numberField(value, ['baseShelfDays', 'base_shelf_days', 'shelfDays', 'shelf_days', 'days']);
    const marketPricePerKg = numberField(value, [
      'marketPricePerKg',
      'market_price_per_kg',
      'marketPrice',
      'pricePerKg',
      'price_per_kg',
      'price',
    ]);
    if (nameTh === null || baseShelfDays === null || marketPricePerKg === null) {
      return;
    }
    if (baseShelfDays <= 0 || baseShelfDays > 60 || marketPricePerKg <= 0) {
      return;
    }
    found.push({ nameTh, baseShelfDays, marketPricePerKg });
  });
  return found;
}

function collectBuyers(constants: Map<string, unknown>): PrototypeBuyer[] {
  const found: PrototypeBuyer[] = [];
  walk(constants, (value) => {
    if (!isRecord(value)) {
      return;
    }
    const buyerType = buyerTypeOf(value);
    const name = stringField(value, ['name', 'nameTh', 'title', 'label']);
    if (buyerType === null || name === null) {
      return;
    }
    found.push({
      name,
      phone: stringField(value, ['phone', 'tel', 'mobile']),
      buyerType,
      lat: numberField(value, ['lat', 'latitude']),
      lng: numberField(value, ['lng', 'lon', 'longitude']),
    });
  });
  return found;
}

function collectUsers(constants: Map<string, unknown>): PrototypeUser[] {
  const found: PrototypeUser[] = [];
  walk(constants, (value) => {
    if (!isRecord(value)) {
      return;
    }
    const role = roleOf(value);
    const name = stringField(value, ['name', 'nameTh', 'title']);
    if (role === null || name === null) {
      return;
    }
    const buyerType = buyerTypeOf(value);
    if (role !== 'buyer' && !hasAnyKey(value, ['role', 'userRole'])) {
      return;
    }
    found.push({
      name,
      phone: stringField(value, ['phone', 'tel', 'mobile']),
      role: role === 'buyer' || buyerType !== null ? 'buyer' : role,
      buyerType,
      lat: numberField(value, ['lat', 'latitude']),
      lng: numberField(value, ['lng', 'lon', 'longitude']),
    });
  });
  return found;
}

function collectPlots(constants: Map<string, unknown>): PrototypePlot[] {
  const found: PrototypePlot[] = [];
  walk(constants, (value) => {
    if (!isRecord(value)) {
      return;
    }
    if (buyerTypeOf(value) !== null || roleOf(value) !== null) {
      return;
    }
    const lat = numberField(value, ['lat', 'latitude']);
    const lng = numberField(value, ['lng', 'lon', 'longitude']);
    const areaRai = numberField(value, ['areaRai', 'area_rai', 'rai', 'area']);
    const name = stringField(value, ['plot', 'plotName', 'name', 'title']);
    const looksLikePlot = areaRai !== null || hasAnyKey(value, ['plot', 'plotName', 'areaRai', 'area_rai', 'rai']);
    if (!looksLikePlot || lat === null || lng === null || name === null) {
      return;
    }
    if (numberField(value, ['weightKg', 'weight_kg', 'kg', 'weight']) !== null) {
      return;
    }
    found.push({ name, lat, lng, areaRai });
  });
  return uniqueBy(found, (plot) => plot.name);
}

function collectLots(constants: Map<string, unknown>, crops: PrototypeCrop[]): PrototypeLot[] {
  const cropNames = new Set(crops.map((crop) => crop.nameTh));
  const found: PrototypeLot[] = [];
  walk(constants, (value) => {
    if (!isRecord(value)) {
      return;
    }
    const grade = gradeOf(value);
    const ripeness = numberField(value, ['ripeness', 'ripe', 'ripeLevel', 'ripe_level']);
    const weightKg = numberField(value, ['weightKg', 'weight_kg', 'kg', 'weight']);
    if (grade === null || ripeness === null || weightKg === null) {
      return;
    }
    const cropName =
      stringField(value, ['cropName', 'crop', 'nameTh', 'name_th']) ??
      crops.find((crop) => crop.nameTh === stringField(value, ['name']))?.nameTh ??
      null;
    if (cropName === null || !cropNames.has(cropName)) {
      const nested = stringField(value, ['cropName', 'crop']);
      if (nested === null || !cropNames.has(nested)) {
        return;
      }
    }
    const resolvedCrop = cropName !== null && cropNames.has(cropName) ? cropName : null;
    if (resolvedCrop === null) {
      return;
    }
    found.push({
      cropName: resolvedCrop,
      plotName: stringField(value, ['plotName', 'plot', 'farm', 'plotTitle']),
      weightKg,
      grade,
      ripeness,
      allowDonation: boolField(value, ['allowDonation', 'allow_donation', 'donate', 'donation']) ?? false,
      photoUrl: stringField(value, ['photoUrl', 'photo_url', 'photo', 'image']),
      tempC: numberField(value, ['tempC', 'temp_c', 'temp', 'temperature']),
      humidity: numberField(value, ['humidity', 'humidityPct', 'rh']),
      shelfHours: numberField(value, ['predictedShelfHours', 'shelfHours', 'shelf_hours', 'hoursLeft', 'hours']),
      lat: numberField(value, ['lat', 'latitude']),
      lng: numberField(value, ['lng', 'lon', 'longitude']),
      areaRai: numberField(value, ['areaRai', 'area_rai', 'rai', 'area']),
      createdAt: stringField(value, ['createdAt', 'created_at', 'harvestedAt']),
    });
  });
  return found;
}

function collectConstants(source: string): Map<string, unknown> {
  const constants = new Map<string, unknown>();
  const pattern = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (name === undefined) {
      continue;
    }
    const start = (match.index ?? 0) + match[0].length;
    try {
      const parsed = parseLiteral(source, start, constants);
      constants.set(name, parsed.value);
    } catch {
      continue;
    }
  }
  return constants;
}

interface Parsed {
  value: unknown;
  index: number;
}

function parseLiteral(source: string, index: number, constants: Map<string, unknown>): Parsed {
  const cursor = skipSpace(source, index);
  const char = source[cursor];
  if (char === '{' ) {
    return parseObject(source, cursor, constants);
  }
  if (char === '[') {
    return parseArray(source, cursor, constants);
  }
  if (char === '"' || char === "'" || char === '`') {
    return parseString(source, cursor);
  }
  if (char === '-' || (char !== undefined && char >= '0' && char <= '9')) {
    return parseNumber(source, cursor);
  }
  if (source.startsWith('true', cursor)) {
    return { value: true, index: cursor + 4 };
  }
  if (source.startsWith('false', cursor)) {
    return { value: false, index: cursor + 5 };
  }
  if (source.startsWith('null', cursor)) {
    return { value: null, index: cursor + 4 };
  }
  const ident = source.slice(cursor).match(/^[A-Za-z_$][\w$]*/);
  if (ident !== null && constants.has(ident[0])) {
    return { value: constants.get(ident[0]), index: cursor + ident[0].length };
  }
  throw new Error(`Unsupported literal at ${cursor}`);
}

function parseObject(source: string, index: number, constants: Map<string, unknown>): Parsed {
  let cursor = index + 1;
  const value: Record<string, unknown> = {};
  while (cursor < source.length) {
    cursor = skipSpace(source, cursor);
    if (source[cursor] === '}') {
      return { value, index: cursor + 1 };
    }
    const keyParsed = parseKey(source, cursor);
    cursor = skipSpace(source, keyParsed.index);
    if (source[cursor] !== ':') {
      throw new Error('Expected colon');
    }
    const parsed = parseLiteral(source, cursor + 1, constants);
    value[keyParsed.key] = parsed.value;
    cursor = skipSpace(source, parsed.index);
    if (source[cursor] === ',') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === '}') {
      return { value, index: cursor + 1 };
    }
    throw new Error('Expected comma or closing brace');
  }
  throw new Error('Unclosed object');
}

function parseArray(source: string, index: number, constants: Map<string, unknown>): Parsed {
  let cursor = index + 1;
  const value: unknown[] = [];
  while (cursor < source.length) {
    cursor = skipSpace(source, cursor);
    if (source[cursor] === ']') {
      return { value, index: cursor + 1 };
    }
    const parsed = parseLiteral(source, cursor, constants);
    value.push(parsed.value);
    cursor = skipSpace(source, parsed.index);
    if (source[cursor] === ',') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === ']') {
      return { value, index: cursor + 1 };
    }
    throw new Error('Expected comma or closing bracket');
  }
  throw new Error('Unclosed array');
}

function parseKey(source: string, index: number): { key: string; index: number } {
  const cursor = skipSpace(source, index);
  const char = source[cursor];
  if (char === '"' || char === "'") {
    const parsed = parseString(source, cursor);
    return { key: String(parsed.value), index: parsed.index };
  }
  const ident = source.slice(cursor).match(/^[A-Za-z_$][\w$]*/);
  if (ident === null) {
    throw new Error('Expected key');
  }
  return { key: ident[0], index: cursor + ident[0].length };
}

function parseString(source: string, index: number): Parsed {
  const quote = source[index];
  let cursor = index + 1;
  let value = '';
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      const next = source[cursor + 1];
      if (next === undefined) {
        break;
      }
      const escaped: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '`': '`' };
      value += escaped[next] ?? next;
      cursor += 2;
      continue;
    }
    if (char === quote) {
      return { value, index: cursor + 1 };
    }
    if (quote === '`' && char === '$') {
      throw new Error('Template expressions are not literal');
    }
    value += char ?? '';
    cursor += 1;
  }
  throw new Error('Unclosed string');
}

function parseNumber(source: string, index: number): Parsed {
  const match = source.slice(index).match(/^-?(?:\d+\.?\d*|\.\d+)/);
  if (match === null) {
    throw new Error('Expected number');
  }
  return { value: Number(match[0]), index: index + match[0].length };
}

function skipSpace(source: string, index: number): number {
  let cursor = index;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor] ?? '')) {
      cursor += 1;
      continue;
    }
    if (source.startsWith('//', cursor)) {
      cursor = source.indexOf('\n', cursor);
      if (cursor === -1) {
        return source.length;
      }
      continue;
    }
    if (source.startsWith('/*', cursor)) {
      const end = source.indexOf('*/', cursor + 2);
      if (end === -1) {
        return source.length;
      }
      cursor = end + 2;
      continue;
    }
    break;
  }
  return cursor;
}

function walk(constants: Map<string, unknown>, visit: (value: unknown) => void): void {
  const seen = new Set<unknown>();
  const visitValue = (value: unknown): void => {
    if (value === null || typeof value !== 'object') {
      return;
    }
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    visit(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        visitValue(item);
      }
      return;
    }
    for (const nested of Object.values(value)) {
      visitValue(nested);
    }
  };
  for (const value of constants.values()) {
    visitValue(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasAnyKey(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => key in value);
}

function stringField(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'string' && field.trim() !== '') {
      return field.trim();
    }
  }
  return null;
}

function numberField(value: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'number' && Number.isFinite(field)) {
      return field;
    }
  }
  return null;
}

function boolField(value: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'boolean') {
      return field;
    }
    if (field === 0 || field === 1) {
      return field === 1;
    }
  }
  return null;
}

function buyerTypeOf(value: Record<string, unknown>): 'vendor' | 'shop' | 'charity' | null {
  const raw = stringField(value, ['buyerType', 'buyer_type', 'type', 'kind']);
  if (raw === null) {
    return null;
  }
  const text = raw.toLowerCase();
  if (['vendor', 'hawker', 'รถเร่'].includes(raw) || text === 'vendor') {
    return 'vendor';
  }
  if (raw === 'รถเร่' || text.includes('vendor')) {
    return 'vendor';
  }
  if (['shop', 'store', 'ร้าน', 'ร้านค้า'].includes(raw) || text === 'shop') {
    return 'shop';
  }
  if (['charity', 'donation', 'สงเคราะห์', 'บริจาค'].includes(raw) || text === 'charity') {
    return 'charity';
  }
  return null;
}

function roleOf(value: Record<string, unknown>): PrototypeUser['role'] | null {
  if (buyerTypeOf(value) !== null) {
    return 'buyer';
  }
  const raw = stringField(value, ['role', 'userRole']);
  if (raw === null) {
    return null;
  }
  const text = raw.toLowerCase();
  if (text === 'farmer' || raw === 'เกษตรกร') {
    return 'farmer';
  }
  if (text === 'buyer' || raw === 'ผู้ซื้อ') {
    return 'buyer';
  }
  if (text === 'driver' || raw === 'คนขับ') {
    return 'driver';
  }
  if (text === 'coordinator' || raw === 'ผู้ประสาน') {
    return 'coordinator';
  }
  return null;
}

function gradeOf(value: Record<string, unknown>): 'normal' | 'substandard' | null {
  const raw = stringField(value, ['grade', 'quality']);
  if (raw === null) {
    return null;
  }
  const text = raw.toLowerCase();
  if (['normal', 'standard', 'a', 'มาตรฐาน', 'ปกติ'].includes(text) || ['มาตรฐาน', 'ปกติ'].includes(raw)) {
    return 'normal';
  }
  if (
    ['substandard', 'sub', 'b', 'low', 'ตกเกรด', 'ต่ำกว่ามาตรฐาน'].includes(text) ||
    ['ตกเกรด', 'ต่ำกว่ามาตรฐาน'].includes(raw)
  ) {
    return 'substandard';
  }
  return null;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(item);
  }
  return result;
}
