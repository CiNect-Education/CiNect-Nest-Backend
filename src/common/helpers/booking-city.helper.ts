/**
 * Tham số ?city= trên API: slug rút gọn (hcm), mã tỉnh mới (ho-chi-minh-city),
 * hoặc tên hiển thị cũ (Ho Chi Minh / Ha Noi) — map về mã provinces_new.code.
 */

const BOOKING_SLUG_TO_PROVINCE: Record<string, string> = {
  hcm: 'ho-chi-minh-city',
  hn: 'ha-noi',
  dn: 'da-nang',
  hp: 'hai-phong',
  ct: 'can-tho',
  bd: 'ho-chi-minh-city',
  nt: 'khanh-hoa',
  vt: 'ho-chi-minh-city',
};

/** Tên city lưu trong DB seed (tiếng Anh không dấu) hoặc tiếng Việt — map về code */
const LEGACY_CITY_TO_PROVINCE: Record<string, string> = {
  'ho chi minh': 'ho-chi-minh-city',
  'ha noi': 'ha-noi',
  'da nang': 'da-nang',
  'hai phong': 'hai-phong',
  'can tho': 'can-tho',
  'hue': 'hue',
  'nha trang': 'khanh-hoa',
  'binh duong': 'ho-chi-minh-city',
  'vung tau': 'ho-chi-minh-city',
  'thanh pho ho chi minh': 'ho-chi-minh-city',
};

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Trả về mã province_new (vd ho-chi-minh-city) hoặc undefined nếu không lọc theo tỉnh.
 */
export function resolveCinemaProvinceCode(city?: string): string | undefined {
  if (!city?.trim()) return undefined;
  const raw = city.trim();
  const low = raw.toLowerCase();

  if (BOOKING_SLUG_TO_PROVINCE[low]) return BOOKING_SLUG_TO_PROVINCE[low];

  const folded = norm(raw);
  if (LEGACY_CITY_TO_PROVINCE[folded]) return LEGACY_CITY_TO_PROVINCE[folded];

  // Đã là mã slug chuẩn (chữ thường, có dấu gạch)
  if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(low)) return low;

  return undefined;
}

/** @deprecated dùng resolveCinemaProvinceCode — giữ tương thích import cũ */
export function resolveCinemaCityFilter(city?: string): string | undefined {
  return resolveCinemaProvinceCode(city);
}
