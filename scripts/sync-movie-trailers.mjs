/**
 * Fills trailerUrl for all movies (YouTube video id).
 * Sources (in order): TMDB_API_KEY → YouTube search scrape.
 *
 * Run: node scripts/sync-movie-trailers.mjs
 * Updates DB + prisma/data/movies-catalog.omdb.json
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, "../prisma/data/movies-catalog.omdb.json");
const DELAY_MS = Number(process.env.TRAILER_SYNC_DELAY_MS || 2200);
const MAX_RETRIES = Number(process.env.TRAILER_SYNC_RETRIES || 4);
const TMDB_KEY = process.env.TMDB_API_KEY?.trim();

const prisma = new PrismaClient();
const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const catalogBySlug = new Map(catalog.map((row) => [row.slug, row]));

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, init = {}) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, ...(init.headers ?? {}) },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr;
}

function releaseYear(releaseDate) {
  if (!releaseDate) return "";
  const y = String(releaseDate).slice(0, 4);
  return /^\d{4}$/.test(y) ? y : "";
}

function normalizeTrailerId(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /[?&]v=([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function fetchTmdbTrailer(imdbId) {
  if (!TMDB_KEY || !imdbId) return null;
  const findRes = await fetch(
    `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${TMDB_KEY}`,
  );
  if (!findRes.ok) return null;
  const findJson = await findRes.json();
  const movieId = findJson.movie_results?.[0]?.id;
  if (!movieId) return null;

  const vidRes = await fetch(
    `https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${TMDB_KEY}`,
  );
  if (!vidRes.ok) return null;
  const vidJson = await vidRes.json();
  const videos = vidJson.results ?? [];
  const pick =
    videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
    videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    videos.find((v) => v.site === "YouTube" && v.type === "Teaser" && v.official) ||
    videos.find((v) => v.site === "YouTube");
  return pick?.key ? normalizeTrailerId(pick.key) : null;
}

async function fetchYoutubeSearchTrailer(title, year) {
  const queries = [
    year ? `${title} ${year} official trailer` : `${title} official trailer`,
    `${title} official trailer`,
  ];
  for (const q of queries) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`;
    try {
      const res = await fetchWithRetry(url);
      const html = await res.text();
      const ids = [...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]);
      const unique = [...new Set(ids)];
      if (unique[0]) return unique[0];
    } catch {
      /* try next query */
    }
    await sleep(400);
  }
  return null;
}

async function resolveTrailer(row) {
  const title = row.originalTitle || row.title;
  const year = releaseYear(row.releaseDate);

  if (row.imdbId && TMDB_KEY) {
    const tmdb = await fetchTmdbTrailer(row.imdbId);
    if (tmdb) return { id: tmdb, source: "tmdb" };
    await sleep(250);
  }

  const yt = await fetchYoutubeSearchTrailer(title, year);
  if (yt) return { id: yt, source: "youtube" };

  return null;
}

async function main() {
  const movies = await prisma.movie.findMany({
    where: { isDeleted: false },
    select: { id: true, slug: true, title: true, trailerUrl: true },
    orderBy: { title: "asc" },
  });

  console.log(`Movies: ${movies.length}, TMDB: ${TMDB_KEY ? "yes" : "no (YouTube fallback)"}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const movie of movies) {
    const row = catalogBySlug.get(movie.slug);
    if (!row) {
      console.warn("  skip (no catalog row):", movie.slug);
      skipped++;
      continue;
    }

    const existing = normalizeTrailerId(movie.trailerUrl);
    if (existing && process.env.TRAILER_SYNC_FORCE !== "1") {
      console.log("  ok (already set):", movie.slug, existing);
      if (!row.trailerUrl) row.trailerUrl = existing;
      skipped++;
      continue;
    }

    process.stdout.write(`  ${movie.slug}… `);
    try {
      const result = await resolveTrailer(row);
      if (!result?.id) {
        console.log("not found");
        failed++;
        await sleep(DELAY_MS);
        continue;
      }

      await prisma.movie.update({
        where: { id: movie.id },
        data: { trailerUrl: result.id },
      });
      row.trailerUrl = result.id;
      console.log(result.id, `(${result.source})`);
      updated++;
    } catch (err) {
      console.log("error:", err.message);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  console.log("\nDone:", { updated, skipped, failed });
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
