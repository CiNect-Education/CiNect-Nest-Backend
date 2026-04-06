/**
 * Reads prisma/data/movies-catalog.omdb.json and writes Flyway migration SQL.
 * Run: node scripts/generate-spring-movies-sql.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/'/g, "''");
}

const raw = JSON.parse(
  readFileSync(join(__dirname, "../prisma/data/movies-catalog.omdb.json"), "utf8")
);

const obsoleteSlugs = [
  "avengers-secret-wars",
  "lat-mat-8-hoi-ket",
  "inside-out-3",
  "dune-part-three",
  "mai-2",
  "the-batman-2",
];
const obsoleteList = obsoleteSlugs.map((s) => `'${esc(s)}'`).join(", ");

const lines = [];
lines.push("-- ============================================================");
lines.push("-- CiNect – V3: Full theatrical movie catalog (OMDb-sourced metadata)");
lines.push("-- Regenerate: node scripts/generate-movies-catalog.mjs && node scripts/generate-spring-movies-sql.mjs");
lines.push("-- ============================================================");
lines.push("");
lines.push("-- Drop obsolete V2 demo films (fictional / placeholder titles)");
lines.push(`DELETE FROM movie_genres WHERE movie_id IN (SELECT id FROM movies WHERE slug IN (${obsoleteList}));`);
lines.push(`DELETE FROM showtimes WHERE movie_id IN (SELECT id FROM movies WHERE slug IN (${obsoleteList}));`);
lines.push(`DELETE FROM movies WHERE slug IN (${obsoleteList});`);
lines.push("");
lines.push("INSERT INTO movies (title, original_title, slug, description, poster_url, banner_url, trailer_url, duration, release_date, director, cast_members, language, subtitles, rating, rating_count, age_rating, formats, status)");
lines.push("VALUES");

const valueRows = raw.map((m, i) => {
  const cast = esc(JSON.stringify(m.castMembers || []));
  const formats = esc(JSON.stringify(m.formats || ["2D"]));
  const trailer = m.trailerUrl ? `'${esc(m.trailerUrl)}'` : "NULL";
  const banner = m.bannerUrl ? `'${esc(m.bannerUrl)}'` : "NULL";
  const subs = m.subtitles != null && m.subtitles !== "" ? `'${esc(m.subtitles)}'` : "NULL";
  return `  (
    '${esc(m.title)}',
    '${esc(m.originalTitle)}',
    '${esc(m.slug)}',
    '${esc(m.description)}',
    '${esc(m.posterUrl)}',
    ${banner},
    ${trailer},
    ${m.duration},
    '${m.releaseDate}',
    '${esc(m.director)}',
    '${cast}'::jsonb,
    '${esc(m.language)}',
    ${subs},
    ${m.rating},
    ${m.ratingCount},
    '${m.ageRating}'::age_rating,
    '${formats}'::jsonb,
    '${m.status}'::movie_status
  )`;
});

lines.push(valueRows.join(",\n"));
lines.push(`ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  original_title = EXCLUDED.original_title,
  description = EXCLUDED.description,
  poster_url = EXCLUDED.poster_url,
  banner_url = EXCLUDED.banner_url,
  trailer_url = EXCLUDED.trailer_url,
  duration = EXCLUDED.duration,
  release_date = EXCLUDED.release_date,
  director = EXCLUDED.director,
  cast_members = EXCLUDED.cast_members,
  language = EXCLUDED.language,
  subtitles = EXCLUDED.subtitles,
  rating = EXCLUDED.rating,
  rating_count = EXCLUDED.rating_count,
  age_rating = EXCLUDED.age_rating,
  formats = EXCLUDED.formats,
  status = EXCLUDED.status;
`);

lines.push("");
lines.push("-- Movie ↔ genre links (idempotent refresh per slug)");
lines.push("DELETE FROM movie_genres WHERE movie_id IN (SELECT id FROM movies WHERE slug IN (" + raw.map((m) => `'${esc(m.slug)}'`).join(", ") + "));");

for (const m of raw) {
  for (const g of m.genreSlugs || []) {
    lines.push(
      `INSERT INTO movie_genres (movie_id, genre_id) SELECT m.id, g.id FROM movies m, genres g WHERE m.slug = '${esc(m.slug)}' AND g.slug = '${esc(g)}' ON CONFLICT DO NOTHING;`
    );
  }
}

const outPath = join(
  __dirname,
  "../../cinect-spring-backend/src/main/resources/db/migration/V10__movie_catalog_omdb.sql"
);
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log("Wrote", outPath);
