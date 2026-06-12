/**
 * Sync movies from VN cinema chains (Moveek, Cinestar) + TMDB VN listings,
 * enrich metadata, merge into catalog JSON, and upsert into PostgreSQL.
 *
 * Run:
 *   node --env-file=.env scripts/sync-movies-from-chains.mjs
 *   npm run db:sync-movies
 */
import "dotenv/config";
import { PrismaClient, MovieStatus } from "@prisma/client";
import {
  CATALOG_PATH,
  FETCH_DELAY_MS,
  TMDB_KEY,
  cleanDisplayTitle,
  dedupeTitleKey,
  enrichMovie,
  fetchText,
  loadCatalog,
  mergeCatalog,
  normalizeTitleKey,
  parseCinestarShowtimes,
  parseMoveekComingSoon,
  parseMoveekDetail,
  parseMoveekListing,
  saveCatalog,
  sleep,
  slugify,
  tmdbRegionalList,
} from "./lib/sync-movies-lib.mjs";

const prisma = new PrismaClient();

const SOURCES = {
  moveek: {
    label: "Moveek",
    urls: ["https://moveek.com/mua-ve/"],
    parse: parseMoveekListing,
  },
  cinestar: {
    label: "Cinestar",
    urls: ["https://cinestar.com.vn/showtimes"],
    parse: parseCinestarShowtimes,
  },
};

function parseArgs(argv) {
  const args = { noDb: false, dryRun: false, sources: ["moveek", "cinestar", "tmdb"] };
  for (const a of argv) {
    if (a === "--no-db") args.noDb = true;
    if (a === "--dry-run") args.dryRun = true;
    if (a.startsWith("--sources=")) {
      args.sources = a.slice("--sources=".length).split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return args;
}

function dedupeStubs(stubs) {
  const map = new Map();
  for (const stub of stubs) {
    const title = cleanDisplayTitle(stub.title);
    const key = dedupeTitleKey(title) || stub.slug;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...stub, title });
      continue;
    }
    map.set(key, {
      ...prev,
      ...stub,
      title,
      slug: prev.slug || stub.slug,
      genreSlugs: stub.genreSlugs?.length ? stub.genreSlugs : prev.genreSlugs,
      posterUrl: stub.posterUrl || prev.posterUrl,
      trailerUrl: stub.trailerUrl || prev.trailerUrl,
      description: stub.description || prev.description,
      sources: [...new Set([...(prev.sources || []), prev.source, stub.source].filter(Boolean))],
      source: prev.source || stub.source,
    });
  }
  return [...map.values()];
}

async function discoverFromSources(enabledSources) {
  const stubs = [];

  for (const key of enabledSources) {
    if (key === "tmdb") continue;
    const cfg = SOURCES[key];
    if (!cfg) {
      console.warn(`Unknown source: ${key}`);
      continue;
    }
    for (const url of cfg.urls) {
      console.log(`Fetching ${cfg.label}: ${url}`);
      try {
        const html = await fetchText(url);
        const rows = cfg.parse(html);
        console.log(`  → ${rows.length} titles`);
        stubs.push(...rows);
        if (key === "moveek") {
          const seenKeys = new Set(stubs.map((s) => dedupeTitleKey(cleanDisplayTitle(s.title))));
          const soon = parseMoveekComingSoon(html).filter(
            (s) => !seenKeys.has(dedupeTitleKey(cleanDisplayTitle(s.title))),
          );
          console.log(`  → ${soon.length} coming-soon titles`);
          stubs.push(...soon);
        }
        await sleep(FETCH_DELAY_MS);
      } catch (err) {
        console.warn(`  ✗ ${cfg.label} failed:`, err.message);
      }
    }
  }

  if (enabledSources.includes("tmdb")) {
    if (!TMDB_KEY) {
      console.warn("TMDB_API_KEY not set — skipping TMDB regional discovery");
    } else {
      for (const type of ["now_playing", "upcoming"]) {
        try {
          const rows = await tmdbRegionalList(type);
          console.log(`TMDB ${type} (VN): ${rows.length} titles`);
          for (const m of rows) {
            stubs.push({
              source: `tmdb-${type}`,
              slug: slugify(m.title),
              title: m.title,
              releaseDate: m.release_date,
              status: type === "upcoming" ? "COMING_SOON" : "NOW_SHOWING",
              ratingCount: m.vote_count || 0,
            });
          }
          await sleep(FETCH_DELAY_MS);
        } catch (err) {
          console.warn(`TMDB ${type} failed:`, err.message);
        }
      }
    }
  }

  return dedupeStubs(stubs);
}

async function fetchMoveekDetails(stubs) {
  const out = new Map();
  const moveekSlugs = stubs.filter((s) => s.slug && s.source?.startsWith("moveek"));
  console.log(`Fetching Moveek detail pages: ${moveekSlugs.length}`);
  for (const stub of moveekSlugs) {
    const url = `https://moveek.com/phim/${stub.slug}/`;
    try {
      const html = await fetchText(url);
      out.set(stub.slug, parseMoveekDetail(html, stub.slug));
      process.stdout.write(".");
    } catch {
      process.stdout.write("x");
    }
    await sleep(FETCH_DELAY_MS);
  }
  console.log("");
  return out;
}

async function upsertGenres() {
  const genresData = [
    { name: "Action", slug: "action" },
    { name: "Comedy", slug: "comedy" },
    { name: "Drama", slug: "drama" },
    { name: "Horror", slug: "horror" },
    { name: "Sci-Fi", slug: "sci-fi" },
    { name: "Romance", slug: "romance" },
    { name: "Animation", slug: "animation" },
    { name: "Thriller", slug: "thriller" },
    { name: "Fantasy", slug: "fantasy" },
    { name: "Adventure", slug: "adventure" },
  ];
  const map = {};
  for (const g of genresData) {
    const row = await prisma.genre.upsert({
      where: { slug: g.slug },
      update: {},
      create: g,
    });
    map[g.slug] = row.id;
  }
  return map;
}

async function upsertMovies(rows, genreIds) {
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const releaseDate = new Date(row.releaseDate);
    const movie = await prisma.movie.upsert({
      where: { slug: row.slug },
      update: {
        title: row.title,
        originalTitle: row.originalTitle,
        description: row.description,
        posterUrl: row.posterUrl || undefined,
        bannerUrl: row.bannerUrl || undefined,
        trailerUrl: row.trailerUrl || undefined,
        duration: row.duration,
        releaseDate,
        director: row.director,
        castMembers: row.castMembers,
        language: row.language,
        subtitles: row.subtitles ?? undefined,
        rating: row.rating,
        ratingCount: row.ratingCount,
        ageRating: row.ageRating,
        formats: row.formats,
        status: row.status,
        isDeleted: false,
      },
      create: {
        slug: row.slug,
        title: row.title,
        originalTitle: row.originalTitle,
        description: row.description,
        posterUrl: row.posterUrl || "https://placehold.co/600x900/png?text=CiNect",
        bannerUrl: row.bannerUrl || undefined,
        trailerUrl: row.trailerUrl || undefined,
        duration: row.duration,
        releaseDate,
        director: row.director,
        castMembers: row.castMembers,
        language: row.language || "Vietnamese",
        subtitles: row.subtitles ?? undefined,
        rating: row.rating,
        ratingCount: row.ratingCount,
        ageRating: row.ageRating,
        formats: row.formats,
        status: row.status,
      },
    });
    if (movie.createdAt.getTime() === movie.updatedAt.getTime()) created++;
    else updated++;

    for (const slug of row.genreSlugs || []) {
      const genreId = genreIds[slug];
      if (!genreId) continue;
      await prisma.movieGenre.upsert({
        where: { movieId_genreId: { movieId: movie.id, genreId } },
        update: {},
        create: { movieId: movie.id, genreId },
      });
    }
  }
  return { created, updated };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("CiNect movie sync from VN chains");
  console.log("Sources:", args.sources.join(", "));
  if (!TMDB_KEY) console.warn("Tip: set TMDB_API_KEY for richer metadata (posters, cast, trailers)");

  const stubs = await discoverFromSources(args.sources);
  console.log(`Discovered ${stubs.length} unique titles`);

  const moveekDetails = await fetchMoveekDetails(stubs);

  const enriched = [];
  let i = 0;
  for (const stub of stubs) {
    i += 1;
    const detail = stub.slug ? moveekDetails.get(stub.slug) : null;
    try {
      const row = await enrichMovie(stub, detail);
      enriched.push(row);
      console.log(`[${i}/${stubs.length}] ${row.title} (${row.status}) ← ${stub.source}`);
    } catch (err) {
      console.warn(`[${i}/${stubs.length}] skip ${stub.title}: ${err.message}`);
    }
    await sleep(FETCH_DELAY_MS);
  }

  const existing = loadCatalog();
  const merged = mergeCatalog(existing, enriched);
  console.log(`Catalog: ${existing.length} existing → ${merged.length} total`);

  if (!args.dryRun) {
    saveCatalog(merged);
    console.log("Wrote", CATALOG_PATH);
  } else {
    console.log("Dry run — catalog not written");
  }

  if (!args.noDb && !args.dryRun) {
    const genreIds = await upsertGenres();
    const { created, updated } = await upsertMovies(merged, genreIds);
    const total = await prisma.movie.count({ where: { isDeleted: false } });
    console.log(`DB upsert: +${created} new, ${updated} updated, ${total} active movies`);
    console.log("Run npm run db:sync-trailers to fill missing YouTube trailers");
  } else if (args.noDb) {
    console.log("Skipped DB upsert (--no-db)");
  }

  const summary = {
    NOW_SHOWING: merged.filter((m) => m.status === MovieStatus.NOW_SHOWING || m.status === "NOW_SHOWING").length,
    COMING_SOON: merged.filter((m) => m.status === MovieStatus.COMING_SOON || m.status === "COMING_SOON").length,
  };
  console.log("Status breakdown:", summary);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
