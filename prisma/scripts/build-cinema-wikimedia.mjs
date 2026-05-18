/**
 * Assign each cinema a unique Wikimedia thumbnail (city/landmark search).
 * Run: node prisma/scripts/build-cinema-wikimedia.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cinemasSrc = readFileSync(join(__dirname, "../data/real-cinemas.seed.ts"), "utf8");
const overridesPath = join(__dirname, "../data/cinema-images-overrides.json");
const outPath = join(__dirname, "../data/cinema-images.json");
const poolPath = join(__dirname, "../data/cinema-image-pool.json");

const slugCityRe = /slug:\s*'([^']+)'[\s\S]*?city:\s*'([^']+)'/g;
const cinemas = [];
for (const m of cinemasSrc.matchAll(slugCityRe)) {
  cinemas.push({ slug: m[1], city: m[2] });
}

let overrides = {};
try {
  overrides = JSON.parse(readFileSync(overridesPath, "utf8"));
} catch {
  /* optional */
}

const pool = JSON.parse(readFileSync(poolPath, "utf8"));
const unsplash = (photoId) =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=1600&q=80`;

async function wikiThumb(search) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: search,
    gsrlimit: "1",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "1600",
    format: "json",
    origin: "*",
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  const pages = json?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  return page?.thumbnail?.source ?? null;
}

const result = {};
let poolIdx = 0;

for (const { slug, city } of cinemas) {
  if (overrides[slug]) {
    result[slug] = overrides[slug];
    continue;
  }

  const cityShort = city.replace(/^Thành phố\s+/i, "").trim();
  const queries = [
    `${cityShort} Vietnam landmark`,
    `${cityShort} Vietnam`,
    `Cinema Vietnam`,
  ];

  let url = null;
  for (const q of queries) {
    url = await wikiThumb(q);
    if (url) break;
    await new Promise((r) => setTimeout(r, 120));
  }

  result[slug] = url ?? unsplash(pool[poolIdx++ % pool.length]);
}

writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
const unique = new Set(Object.values(result)).size;
console.log(`Wrote ${cinemas.length} cinemas (${unique} unique), wiki: ${Object.values(result).filter((u) => u.includes("wikimedia")).length}`);
