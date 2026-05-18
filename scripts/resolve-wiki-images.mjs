/**
 * Batch-resolve Wikipedia thumbnails (one API call per batch).
 * Run: node scripts/resolve-wiki-images.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const __dirname = dirname(fileURLToPath(import.meta.url));
const UA = "CiNectImageBot/1.0 (https://cinect.vn; local-dev)";

const QUERIES = {
  "cinect-landmark-81": "Landmark 81",
  "cinect-vincom-center": "Saigon Centre",
  "cinect-royal-city": "Royal City Hanoi",
  "cgv-aeon-mall-long-bien": "AEON Mall Long Biên",
  "cgv-lotte-center-hanoi": "Lotte Center Hanoi",
  "lotte-cinema-ocean-park": "Vinhomes Ocean Park",
  "bhd-star-discovery-da-nang": "Dragon Bridge Da Nang",
  "lotte-da-nang": "Da Nang",
  "cgv-vincom-hai-phong": "Hai Phong",
  "cgv-sense-city-can-tho": "Can Tho",
  "cgv-hue": "Hue Vietnam",
  "cgv-nha-trang": "Nha Trang",
  "cgv-aeon-binh-duong": "AEON Mall Bình Dương",
  "cgv-da-lat": "Da Lat",
  "cgv-quang-ninh": "Ha Long Bay",
  "hcm": "Ho Chi Minh City",
  "hanoi": "Hanoi",
  "danang": "Da Nang",
  "cantho": "Can Tho",
  "hue": "Hue",
  "nhatrang": "Nha Trang",
  "halong": "Ha Long Bay",
  "dongnai": "Bien Hoa",
  "lamdong": "Da Lat",
  "quangninh": "Ha Long Bay",
};

async function searchThumb(term) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: term,
    gsrlimit: "1",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "1280",
    format: "json",
    origin: "*",
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (text.startsWith("You are")) return null;
  const json = JSON.parse(text);
  const pages = Object.values(json.query?.pages ?? {});
  return pages[0]?.thumbnail?.source ?? null;
}

const out = {};
for (const [key, term] of Object.entries(QUERIES)) {
  process.stdout.write(`${key}... `);
  out[key] = (await searchThumb(term)) ?? "";
  console.log(out[key] ? "ok" : "miss");
  await new Promise((r) => setTimeout(r, 2500));
}

writeFileSync(
  join(__dirname, "../prisma/data/cinema-wiki-resolved.json"),
  JSON.stringify(out, null, 2),
  "utf8",
);
