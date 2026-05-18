/**
 * Build prisma/data/movie-wiki-images.json from Wikipedia REST API (real posters).
 * Run: node prisma/scripts/build-movie-wiki-images.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(__dirname, "../data/movies-catalog.omdb.json");
const outPath = join(__dirname, "../data/movie-wiki-images.json");

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wikiTitleCandidates(movie) {
  const titles = [movie.title, movie.originalTitle].filter(Boolean);
  const out = [];
  for (const t of titles) {
    out.push(t.replace(/\s+/g, "_"));
    out.push(t.replace(/:\s*/g, ":_").replace(/\s+/g, "_"));
    out.push(t.replace(/&/g, "%26").replace(/\s+/g, "_"));
  }
  return [...new Set(out)];
}

async function fetchWikiImage(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "CiNect-Seed/1.0 (cinema demo; contact@cinect.vn)" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const src = data.originalimage?.source || data.thumbnail?.source;
  if (!src || !/^https:\/\//i.test(src)) return null;
  return src;
}

async function resolveMovieImage(movie) {
  for (const title of wikiTitleCandidates(movie)) {
    const src = await fetchWikiImage(title);
    if (src) return src;
    await sleep(120);
  }
  return null;
}

function normalizeAmazonUrl(url) {
  if (!url || typeof url !== "string") return url;
  return url.replace(/@/g, "%40");
}

const result = {};

for (let i = 0; i < catalog.length; i++) {
  const movie = catalog[i];
  process.stdout.write(`[${i + 1}/${catalog.length}] ${movie.slug}… `);
  let posterUrl = await resolveMovieImage(movie);
  if (!posterUrl) {
    posterUrl = normalizeAmazonUrl(movie.posterUrl) || null;
    console.log("amazon fallback");
  } else {
    console.log("wiki");
  }
  const bannerUrl =
    posterUrl ||
    normalizeAmazonUrl(movie.bannerUrl) ||
    normalizeAmazonUrl(movie.posterUrl) ||
    null;
  result[movie.imdbId || movie.slug] = {
    posterUrl: posterUrl || normalizeAmazonUrl(movie.posterUrl) || "",
    bannerUrl: bannerUrl || undefined,
  };
  await sleep(200);
}

writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
console.log(`\nWrote ${Object.keys(result).length} entries → ${outPath}`);
