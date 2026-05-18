/**
 * Build cinema-images.json from verified Wikipedia photos (no Unsplash).
 * Run: node scripts/build-cinema-real-images.mjs
 * Prerequisite: node scripts/resolve-wiki-images.mjs (optional refresh)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "../prisma/data");

const cinemasSrc = readFileSync(join(dataDir, "real-cinemas.seed.ts"), "utf8");
const slugBlockRe =
  /slug:\s*'([^']+)'[\s\S]*?name:\s*'([^']+)'[\s\S]*?city:\s*'([^']+)'/g;
const cinemas = [];
for (const m of cinemasSrc.matchAll(slugBlockRe)) {
  cinemas.push({ slug: m[1], name: m[2], city: m[3] });
}

const wiki = JSON.parse(
  readFileSync(join(dataDir, "cinema-wiki-resolved.json"), "utf8"),
);

const MALL = Object.fromEntries(
  Object.entries(wiki).filter(
    ([k, v]) => v && !["hcm", "hanoi", "danang", "cantho", "hue", "nhatrang", "halong", "dongnai", "lamdong", "quangninh"].includes(k),
  ),
);

MALL["cinect-royal-city"] = wiki.hanoi;
MALL["lotte-cinema-ocean-park"] = wiki.hanoi;
MALL["cgv-aeon-binh-duong"] = wiki.hcm;

const CITY_LANDMARK = {
  "Thành phố Hồ Chí Minh": wiki.hcm,
  "Hà Nội": wiki.hanoi,
  "Đà Nẵng": wiki.danang,
  "Hải Phòng": wiki["cgv-vincom-hai-phong"],
  "Cần Thơ": wiki.cantho,
  "Huế": wiki["cgv-hue"],
  "Khánh Hòa": wiki.nhatrang,
  "Đồng Nai": wiki.dongnai,
  "Đắk Lắk": wiki.lamdong,
  "Gia Lai": wiki.danang,
  "Lâm Đồng": wiki.lamdong,
  "Nghệ An": wiki.hanoi,
  "Thanh Hóa": wiki.hanoi,
  "Bắc Ninh": wiki.hanoi,
  "Thái Nguyên": wiki.hanoi,
  "Lạng Sơn": wiki.hanoi,
  "Quảng Ninh": wiki.quangninh,
  "Lào Cai": wiki.hanoi,
  "Điện Biên": wiki.hanoi,
  "An Giang": wiki.cantho,
  "Đồng Tháp": wiki.cantho,
  "Vĩnh Long": wiki.cantho,
  "Cà Mau": wiki.cantho,
  "Tây Ninh": wiki.hcm,
  "Ninh Bình": wiki.halong,
  "Hưng Yên": wiki.hanoi,
  "Phú Thọ": wiki.hanoi,
  "Sơn La": wiki.hanoi,
  "Lai Châu": wiki.hanoi,
  "Cao Bằng": wiki.hanoi,
  "Hà Tĩnh": wiki["cgv-hue"],
  "Quảng Trị": wiki["cgv-hue"],
};

const result = {};
for (const cinema of cinemas) {
  result[cinema.slug] =
    MALL[cinema.slug] || CITY_LANDMARK[cinema.city] || wiki.hcm;
}

writeFileSync(
  join(dataDir, "cinema-images.json"),
  JSON.stringify(result, null, 2),
  "utf8",
);

const unique = new Set(Object.values(result)).size;
console.log({
  total: cinemas.length,
  mapped: Object.keys(result).length,
  wikimedia: Object.values(result).filter((u) => u.includes("wikimedia")).length,
  unique,
});
