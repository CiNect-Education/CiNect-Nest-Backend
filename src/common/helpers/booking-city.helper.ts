/** URL/booking region ids (e.g. hcm) → cinema.city values stored in DB */
const BOOKING_REGION_TO_DB_CITY: Record<string, string> = {
  hcm: 'Ho Chi Minh',
  hn: 'Ha Noi',
  dn: 'Da Nang',
  hp: 'Hai Phong',
  ct: 'Can Tho',
  bd: 'Binh Duong',
  nt: 'Nha Trang',
  vt: 'Vung Tau',
};

/** Maps booking ?city= codes to DB city strings; passes through unknown values. */
export function resolveCinemaCityFilter(city?: string): string | undefined {
  if (!city?.trim()) return undefined;
  const key = city.trim().toLowerCase();
  return BOOKING_REGION_TO_DB_CITY[key] ?? city.trim();
}
