/**
 * Fetch IMDb + Metacritic scores from OMDb for all catalog movies.
 * Updates prisma/data/movies-catalog.omdb.json and the database.
 *
 * Usage: node scripts/sync-movie-external-scores.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { omdbByImdbId, omdbByTitle, CATALOG_PATH } from "./lib/sync-movies-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseImdbRating(omdb) {
  if (!omdb?.imdbRating || omdb.imdbRating === "N/A") return null;
  const n = parseFloat(omdb.imdbRating);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : null;
}

function parseMetacritic(omdb) {
  if (!omdb?.Metascore || omdb.Metascore === "N/A") return null;
  const n = parseInt(omdb.Metascore, 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
}

async function fetchScores(row) {
  let omdb = row.imdbId ? await omdbByImdbId(row.imdbId) : null;
  if (!omdb) {
    const year = (row.releaseDate || "").slice(0, 4);
    omdb = await omdbByTitle(row.originalTitle || row.title, year);
    if (!omdb && row.originalTitle && row.originalTitle !== row.title) {
      omdb = await omdbByTitle(row.title, year);
    }
  }
  if (!omdb) return { imdbId: row.imdbId ?? null, imdbRating: null, metacriticScore: null };

  return {
    imdbId: omdb.imdbID || row.imdbId || null,
    imdbRating: parseImdbRating(omdb),
    metacriticScore: parseMetacritic(omdb),
  };
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  let updated = 0;
  let withImdb = 0;
  let withMc = 0;

  for (let i = 0; i < catalog.length; i++) {
    const row = catalog[i];
    process.stdout.write(`[${i + 1}/${catalog.length}] ${row.title}... `);

    const scores = await fetchScores(row);
    row.imdbId = scores.imdbId ?? row.imdbId;
    row.imdbRating = scores.imdbRating;
    row.metacriticScore = scores.metacriticScore;
    if (scores.imdbRating != null) withImdb++;
    if (scores.metacriticScore != null) withMc++;

    const dbMovie = await prisma.movie.findFirst({
      where: { slug: row.slug, isDeleted: false },
      select: { id: true },
    });
    if (dbMovie) {
      await prisma.movie.update({
        where: { id: dbMovie.id },
        data: {
          imdbId: scores.imdbId,
          imdbRating: scores.imdbRating,
          metacriticScore: scores.metacriticScore,
        },
      });
      updated++;
    }

    console.log(
      scores.imdbId
        ? `IMDb ${scores.imdbRating ?? "—"} · MC ${scores.metacriticScore ?? "—"}`
        : "no match",
    );
    await sleep(220);
  }

  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`\nDone. DB updated: ${updated}/${catalog.length}, IMDb: ${withImdb}, Metacritic: ${withMc}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
