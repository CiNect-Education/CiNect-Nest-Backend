/**
 * One unique cinema/mall photo per slug (no duplicates).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../data/cinema-images.json");
const poolPath = join(__dirname, "../data/cinema-image-pool.json");
const overridesPath = join(__dirname, "../data/cinema-images-overrides.json");

const cinemasSrc = readFileSync(join(__dirname, "../data/real-cinemas.seed.ts"), "utf8");
const slugs = [...cinemasSrc.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]).sort();

const pool = JSON.parse(readFileSync(poolPath, "utf8"));
let overrides = {};
try {
  overrides = JSON.parse(readFileSync(overridesPath, "utf8"));
} catch {
  /* optional */
}

const unsplash = (photoId) =>
  `https://images.unsplash.com/photo-${photoId}?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80`;

if (pool.length < slugs.length) {
  throw new Error(`Need at least ${slugs.length} pool images, got ${pool.length}`);
}

const result = {};
for (let i = 0; i < slugs.length; i++) {
  const slug = slugs[i];
  result[slug] = overrides[slug] ?? unsplash(pool[i]);
}

writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
const unique = new Set(Object.values(result)).size;
console.log(`Wrote ${slugs.length} cinemas (${unique} unique images)`);
