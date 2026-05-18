/**
 * Fetch real cinema / mall photos via Wikimedia Commons (+ optional Google Places).
 * Run: node scripts/fetch-real-cinema-images.mjs
 * Requires: DATABASE_URL not needed; writes prisma/data/cinema-images.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/** Dev script only — fixes Wikimedia TLS on some Windows networks. */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const envRaw = readFileSync(join(__dirname, "../.env"), "utf8");
  for (const line of envRaw.split("\n")) {
    const m = line.match(/^GOOGLE_MAPS_API_KEY=(.+)$/);
    if (m?.[1]) process.env.GOOGLE_MAPS_API_KEY = m[1].trim();
  }
} catch {
  /* optional */
}

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const GOOGLE_TEXT = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_PHOTO = "https://maps.googleapis.com/maps/api/place/photo";

const cinemasSrc = readFileSync(
  join(__dirname, "../prisma/data/real-cinemas.seed.ts"),
  "utf8",
);

const slugBlockRe =
  /slug:\s*'([^']+)'[\s\S]*?name:\s*'([^']+)'[\s\S]*?address:\s*'([^']+)'[\s\S]*?city:\s*'([^']+)'/g;

const cinemas = [];
for (const m of cinemasSrc.matchAll(slugBlockRe)) {
  cinemas.push({ slug: m[1], name: m[2], address: m[3], city: m[4] });
}

let overrides = {};
const overridesPath = join(__dirname, "../prisma/data/cinema-images-overrides.json");
try {
  overrides = JSON.parse(readFileSync(overridesPath, "utf8"));
} catch {
  /* optional */
}

const usedUrls = new Set(Object.values(overrides));

function cityShort(city) {
  return city.replace(/^Thành phố\s+/i, "").trim();
}

function mallFromName(name) {
  const m = name.match(
    /(Vincom[^,]*|Aeon Mall[^,]*|Lotte Center[^,]*|Royal City[^,]*|Sense City[^,]*|Landmark 81[^,]*|Gigamall[^,]*|Mipec[^,]*|Lapen Center[^,]*|Ocean Park[^,]*)/i,
  );
  return m?.[1]?.trim();
}

function buildQueries(cinema) {
  const city = cityShort(cinema.city);
  const mall = mallFromName(cinema.name);
  const brand = cinema.name.split(" ")[0];
  return [
    mall ? `${mall} ${city} Vietnam` : null,
    `${cinema.name} Vietnam`,
    mall ? `${mall} Vietnam` : null,
    `${brand} cinema ${city} Vietnam`,
    `${city} shopping mall Vietnam`,
  ].filter(Boolean);
}

async function fetchCommons(query) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "5",
    prop: "pageimages",
    piprop: "original|thumbnail",
    pithumbsize: "1600",
    format: "json",
    origin: "*",
  });
  const res = await fetch(`${WIKIMEDIA_API}?${params}`);
  if (!res.ok) return [];
  const json = await res.json();
  const pages = Object.values(json.query?.pages ?? {});
  const urls = [];
  for (const p of pages) {
    const src = p.original?.source || p.thumbnail?.source;
    if (src && /^https?:\/\//i.test(src)) urls.push(src);
  }
  return urls;
}

async function fetchGoogle(query, apiKey) {
  const params = new URLSearchParams({
    query,
    language: "vi",
    region: "vn",
    key: apiKey,
  });
  const searchRes = await fetch(`${GOOGLE_TEXT}?${params}`);
  if (!searchRes.ok) return undefined;
  const searchJson = await searchRes.json();
  if (searchJson.status !== "OK" || !searchJson.results?.length) return undefined;
  const photoRef = searchJson.results[0]?.photos?.[0]?.photo_reference;
  if (!photoRef) return undefined;
  const photoParams = new URLSearchParams({
    maxwidth: "1600",
    photoreference: photoRef,
    key: apiKey,
  });
  const photoRes = await fetch(`${GOOGLE_PHOTO}?${photoParams}`);
  if (!photoRes.ok) return undefined;
  return photoRes.url;
}

async function pickImage(cinema) {
  if (overrides[cinema.slug]) return overrides[cinema.slug];

  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const queries = buildQueries(cinema);

  if (googleKey) {
    for (const q of queries) {
      const url = await fetchGoogle(q, googleKey);
      if (url && !usedUrls.has(url)) return url;
      await sleep(200);
    }
  }

  for (const q of queries) {
    const urls = await fetchCommons(q);
    for (const url of urls) {
      if (!usedUrls.has(url)) return url;
    }
    await sleep(250);
  }

  return undefined;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const result = {};
let fromOverride = 0;
let fromFetch = 0;
let missing = 0;

for (const cinema of cinemas) {
  if (overrides[cinema.slug]) {
    result[cinema.slug] = overrides[cinema.slug];
    usedUrls.add(overrides[cinema.slug]);
    fromOverride++;
    continue;
  }

  process.stdout.write(`Fetching ${cinema.slug}... `);
  const url = await pickImage(cinema);
  if (url) {
    result[cinema.slug] = url;
    usedUrls.add(url);
    fromFetch++;
    console.log("ok");
  } else {
    missing++;
    console.log("skip");
  }
}

  if (missing > 0) {
    console.warn(`${missing} cinemas need manual overrides in cinema-images-overrides.json`);
  }

writeFileSync(
  join(__dirname, "../prisma/data/cinema-images.json"),
  JSON.stringify(result, null, 2),
  "utf8",
);

writeFileSync(overridesPath, JSON.stringify(overrides, null, 2), "utf8");

console.log({
  total: cinemas.length,
  mapped: Object.keys(result).length,
  fromOverride,
  fromFetch,
  unique: new Set(Object.values(result)).size,
});
