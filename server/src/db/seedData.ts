export const DEMO_PASSWORD = 'demo1234';

/** Fixed seed clock so expires_at stays the same when seed runs again. 09:00 Asia/Bangkok. */
export const SEED_AT_ISO = '2026-09-22T02:00:00.000Z';

export const CO2E_PER_KG = 2.5;

export const DEPOT = {
  name: 'จุดรวบรวมวิสาหกิจชุมชน',
  lat: 13.65,
  lng: 100.62,
} as const;

/** Plan fallback. The prototype screen uses 34°C / 78% when weather fails. */
export const PLAN_WEATHER_FALLBACK = { tempC: 32, humidity: 75 } as const;

export const PROTOTYPE_WEATHER_FALLBACK = { tempC: 34, humidity: 78 } as const;

export const RIPENESS_LABELS = ['ดิบ', 'เริ่มสุก', 'สุกพอดี', 'สุกมาก', 'ใกล้งอม'] as const;

export const crops = [
  { key: 'mango', nameTh: 'มะม่วง', baseShelfDays: 5, marketPricePerKg: 40 },
  { key: 'banana', nameTh: 'กล้วยน้ำว้า', baseShelfDays: 4, marketPricePerKg: 25 },
  { key: 'tomato', nameTh: 'มะเขือเทศ', baseShelfDays: 6, marketPricePerKg: 30 },
  { key: 'morning-glory', nameTh: 'ผักบุ้ง', baseShelfDays: 2, marketPricePerKg: 20 },
  { key: 'lime', nameTh: 'มะนาว', baseShelfDays: 14, marketPricePerKg: 35 },
] as const;

export type CropKey = (typeof crops)[number]['key'];

export const buyers = [
  { name: 'รถพุ่มพวงป้าแดง', buyerType: 'vendor', lat: 13.662, lng: 100.611, phone: '0800000011' },
  { name: 'บ้านพักเด็กชุมชน', buyerType: 'charity', lat: 13.641, lng: 100.634, phone: '0800000012' },
  { name: 'ร้านข้าวแกงลุงชม', buyerType: 'shop', lat: 13.657, lng: 100.642, phone: '0800000013' },
] as const;

export const staff = [
  { role: 'driver', name: 'คนขับตัวอย่าง', phone: '0800000004' },
  { role: 'coordinator', name: 'ผู้ประสานตัวอย่าง', phone: '0800000005' },
] as const;

export const farmers = [
  {
    name: 'ลุงสมชาย',
    phone: '0800000001',
    plotName: 'แปลงลุงสมชาย',
    lat: 13.668,
    lng: 100.628,
    areaRai: 1,
    lot: {
      cropKey: 'mango' as const,
      weightKg: 80,
      grade: 'substandard' as const,
      ripeness: 3,
      hoursLeft: 20,
      allowDonation: true,
    },
  },
  {
    name: 'ป้าบุญมี',
    phone: '0800000002',
    plotName: 'แปลงป้าบุญมี',
    lat: 13.645,
    lng: 100.605,
    areaRai: 1,
    lot: {
      cropKey: 'morning-glory' as const,
      weightKg: 25,
      grade: 'normal' as const,
      ripeness: 2,
      hoursLeft: 30,
      allowDonation: false,
    },
  },
  {
    name: 'พี่ต้อม',
    phone: '0800000003',
    plotName: 'แปลงพี่ต้อม',
    lat: 13.635,
    lng: 100.622,
    areaRai: 1,
    lot: {
      cropKey: 'tomato' as const,
      weightKg: 60,
      grade: 'substandard' as const,
      ripeness: 3,
      hoursLeft: 70,
      allowDonation: true,
    },
  },
] as const;

/** Expected prototype results at 34°C for the Phase 2 shelf-life and price tests. */
export const phase2Samples = [
  { cropKey: 'mango' as const, ripeness: 2, tempC: 34, shelfHours: 55, priceNormal: 36 },
  { cropKey: 'mango' as const, ripeness: 3, tempC: 34, shelfHours: 37 },
] as const;
