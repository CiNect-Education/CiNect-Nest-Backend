/**
 * Build bundled v1 snapshot when live API is unreachable.
 * Usage: npx ts-node scripts/build-open-api-v1-snapshot.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PROVINCES_LEGACY } from '../prisma/data/provinces-legacy';

/** Numeric codes from provinces.open-api.vn v1 */
const V1_NUMERIC_CODE: Record<string, number> = {
  'ha-noi': 1,
  'ha-giang': 2,
  'cao-bang': 4,
  'bac-kan': 6,
  'tuyen-quang': 8,
  'lao-cai': 10,
  'dien-bien': 11,
  'lai-chau': 12,
  'son-la': 14,
  'yen-bai': 15,
  'hoa-binh': 17,
  'thai-nguyen': 19,
  'lang-son': 20,
  'quang-ninh': 22,
  'bac-giang': 24,
  'phu-tho': 25,
  'vinh-phuc': 26,
  'bac-ninh': 27,
  'hai-duong': 30,
  'hai-phong': 31,
  'hung-yen': 33,
  'thai-binh': 34,
  'ha-nam': 35,
  'nam-dinh': 36,
  'ninh-binh': 37,
  'thanh-hoa': 38,
  'nghe-an': 40,
  'ha-tinh': 42,
  'quang-binh': 44,
  'quang-tri': 45,
  'thua-thien-hue': 46,
  'da-nang': 48,
  'quang-nam': 49,
  'quang-ngai': 51,
  'binh-dinh': 52,
  'phu-yen': 54,
  'khanh-hoa': 56,
  'ninh-thuan': 58,
  'binh-thuan': 60,
  'kon-tum': 62,
  'gia-lai': 64,
  'dak-lak': 66,
  'dak-nong': 67,
  'lam-dong': 68,
  'binh-phuoc': 70,
  'tay-ninh': 72,
  'binh-duong': 74,
  'dong-nai': 75,
  'ba-ria-vung-tau': 77,
  'ho-chi-minh': 79,
  'long-an': 80,
  'tien-giang': 82,
  'ben-tre': 83,
  'tra-vinh': 84,
  'vinh-long': 86,
  'dong-thap': 87,
  'an-giang': 89,
  'kien-giang': 91,
  'can-tho': 92,
  'hau-giang': 93,
  'soc-trang': 94,
  'bac-lieu': 95,
  'ca-mau': 96,
};

const THANH_PHO = new Set([
  'ha-noi',
  'hai-phong',
  'da-nang',
  'can-tho',
  'ho-chi-minh',
  'thua-thien-hue',
]);

function slugToCodename(slug: string): string {
  const underscored = slug.replace(/-/g, '_');
  if (THANH_PHO.has(slug)) {
    if (slug === 'thua-thien-hue') return 'thanh_pho_hue';
    return `thanh_pho_${underscored}`;
  }
  return `tinh_${underscored}`;
}

function adminPrefix(nameVi: string, slug: string): string {
  if (THANH_PHO.has(slug)) return `Thành phố ${nameVi.replace(/^Thành phố\s+/i, '')}`;
  return `Tỉnh ${nameVi}`;
}

const rows = PROVINCES_LEGACY.map((p) => ({
  name: adminPrefix(p.nameVi, p.code),
  code: V1_NUMERIC_CODE[p.code],
  codename: slugToCodename(p.code),
  division_type: THANH_PHO.has(p.code) ? 'thành phố trung ương' : 'tỉnh',
}));

const outPath = join(__dirname, '..', 'prisma', 'data', 'open-api-v1-provinces.json');
writeFileSync(outPath, JSON.stringify(rows));
console.log(`Wrote ${rows.length} rows to ${outPath}`);
