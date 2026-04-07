/**
 * Fetches movie metadata from OMDb (demo key "thewdb") and writes JSON for seed review.
 * Run: node scripts/generate-movies-catalog.mjs
 * Output: prisma/data/movies-catalog.omdb.json
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OMDB_KEY = process.env.OMDB_API_KEY || "thewdb";
const BASE = `http://www.omdbapi.com/?apikey=${OMDB_KEY}`;

/** Curated: major theatrical titles + Vietnamese box-office hits (IMDb ids verified). */
const ENTRIES = [
  { imdbId: "tt6263850", slug: "deadpool-wolverine", genreSlugs: ["action", "comedy", "adventure"], status: "NOW_SHOWING", ageRating: "C16", formats: ["2D", "IMAX", "3D"], ratingCount: 125000 },
  { imdbId: "tt22022452", slug: "inside-out-2", genreSlugs: ["animation", "comedy", "drama"], status: "NOW_SHOWING", ageRating: "P", formats: ["2D", "3D"], ratingCount: 98000 },
  { imdbId: "tt15239678", slug: "dune-part-two", genreSlugs: ["sci-fi", "adventure", "drama"], status: "NOW_SHOWING", ageRating: "C13", formats: ["2D", "IMAX"], ratingCount: 210000 },
  { imdbId: "tt14539740", slug: "godzilla-x-kong-the-new-empire", genreSlugs: ["action", "sci-fi", "adventure"], status: "NOW_SHOWING", ageRating: "C13", formats: ["2D", "IMAX"], ratingCount: 89000 },
  { imdbId: "tt21692408", slug: "kung-fu-panda-4", genreSlugs: ["animation", "comedy", "adventure"], status: "NOW_SHOWING", ageRating: "P", formats: ["2D", "3D"], ratingCount: 76000 },
  { imdbId: "tt12037194", slug: "furiosa-a-mad-max-saga", genreSlugs: ["action", "adventure", "sci-fi"], status: "NOW_SHOWING", ageRating: "C18", formats: ["2D", "IMAX"], ratingCount: 112000 },
  { imdbId: "tt18412256", slug: "alien-romulus", genreSlugs: ["horror", "sci-fi", "thriller"], status: "NOW_SHOWING", ageRating: "C18", formats: ["2D", "IMAX"], ratingCount: 145000 },
  { imdbId: "tt2049403", slug: "beetlejuice-beetlejuice", genreSlugs: ["comedy", "fantasy", "horror"], status: "NOW_SHOWING", ageRating: "C13", formats: ["2D"], ratingCount: 67000 },
  { imdbId: "tt11315808", slug: "joker-folie-a-deux", genreSlugs: ["thriller", "drama", "romance"], status: "NOW_SHOWING", ageRating: "C18", formats: ["2D", "IMAX"], ratingCount: 198000 },
  { imdbId: "tt16366836", slug: "venom-the-last-dance", genreSlugs: ["action", "sci-fi", "thriller"], status: "NOW_SHOWING", ageRating: "C13", formats: ["2D", "IMAX", "3D"], ratingCount: 72000 },
  { imdbId: "tt9218128", slug: "gladiator-ii", genreSlugs: ["action", "adventure", "drama"], status: "NOW_SHOWING", ageRating: "C16", formats: ["2D", "IMAX"], ratingCount: 134000 },
  { imdbId: "tt13622970", slug: "moana-2", genreSlugs: ["animation", "adventure", "comedy"], status: "NOW_SHOWING", ageRating: "P", formats: ["2D", "3D"], ratingCount: 45000 },
  { imdbId: "tt1262426", slug: "wicked", genreSlugs: ["fantasy", "romance", "adventure"], status: "NOW_SHOWING", ageRating: "P", formats: ["2D", "IMAX"], ratingCount: 156000 },
  { imdbId: "tt18259086", slug: "sonic-the-hedgehog-3", genreSlugs: ["action", "comedy", "adventure"], status: "NOW_SHOWING", ageRating: "P", formats: ["2D", "3D"], ratingCount: 41000 },
  { imdbId: "tt8864596", slug: "transformers-one", genreSlugs: ["animation", "action", "sci-fi"], status: "NOW_SHOWING", ageRating: "P", formats: ["2D", "3D"], ratingCount: 52000 },
  { imdbId: "tt13186482", slug: "mufasa-the-lion-king", genreSlugs: ["animation", "adventure", "drama"], status: "NOW_SHOWING", ageRating: "P", formats: ["2D", "3D"], ratingCount: 38000 },
  { imdbId: "tt4919268", slug: "bad-boys-ride-or-die", genreSlugs: ["action", "comedy", "thriller"], status: "NOW_SHOWING", ageRating: "C16", formats: ["2D", "IMAX"], ratingCount: 88000 },
  { imdbId: "tt29623480", slug: "the-wild-robot", genreSlugs: ["animation", "sci-fi", "adventure"], status: "NOW_SHOWING", ageRating: "P", formats: ["2D", "3D"], ratingCount: 62000 },
  { imdbId: "tt13433802", slug: "a-quiet-place-day-one", genreSlugs: ["horror", "sci-fi", "drama"], status: "NOW_SHOWING", ageRating: "C16", formats: ["2D", "IMAX"], ratingCount: 99000 },
  { imdbId: "tt17279496", slug: "civil-war-2024", genreSlugs: ["action", "thriller", "drama"], status: "NOW_SHOWING", ageRating: "C18", formats: ["2D", "IMAX"], ratingCount: 121000 },
  { imdbId: "tt11389872", slug: "kingdom-of-the-planet-of-the-apes", genreSlugs: ["action", "sci-fi", "adventure"], status: "NOW_SHOWING", ageRating: "C13", formats: ["2D", "3D"], ratingCount: 77000 },
  { imdbId: "tt21235248", slug: "ghostbusters-frozen-empire", genreSlugs: ["comedy", "fantasy", "adventure"], status: "NOW_SHOWING", ageRating: "C13", formats: ["2D", "3D"], ratingCount: 54000 },
  { imdbId: "tt8790086", slug: "kraven-the-hunter", genreSlugs: ["action", "thriller", "adventure"], status: "NOW_SHOWING", ageRating: "C16", formats: ["2D", "IMAX"], ratingCount: 43000 },
  { imdbId: "tt7510222", slug: "despicable-me-4", genreSlugs: ["animation", "comedy", "adventure"], status: "NOW_SHOWING", ageRating: "P", formats: ["2D", "3D"], ratingCount: 51000 },
  { imdbId: "tt31174028", slug: "mai-2024", genreSlugs: ["romance", "drama"], status: "NOW_SHOWING", ageRating: "C16", formats: ["2D"], ratingCount: 34000, language: "Vietnamese", subtitles: null },
  { imdbId: "tt32229497", slug: "lat-mat-7-mot-dieu-uoc", genreSlugs: ["drama", "comedy"], status: "NOW_SHOWING", ageRating: "C13", formats: ["2D"], ratingCount: 28000, language: "Vietnamese", subtitles: null },
  { imdbId: "tt33996602", slug: "bo-tu-bao-thu", genreSlugs: ["comedy", "romance", "drama"], status: "NOW_SHOWING", ageRating: "C16", formats: ["2D"], ratingCount: 12000, language: "Vietnamese", subtitles: null },
  { imdbId: "tt34268350", slug: "dia-dao-mat-troi-trong-bong-toi", genreSlugs: ["drama", "thriller", "action"], status: "NOW_SHOWING", ageRating: "C16", formats: ["2D", "IMAX"], ratingCount: 22000, language: "Vietnamese", subtitles: null },
  { imdbId: "tt31647306", slug: "lam-giau-voi-ma", genreSlugs: ["comedy", "horror"], status: "NOW_SHOWING", ageRating: "C16", formats: ["2D"], ratingCount: 9000, language: "Vietnamese", subtitles: null },
  { imdbId: "tt32740311", slug: "ma-da-the-drowning-spirit", genreSlugs: ["horror", "thriller"], status: "NOW_SHOWING", ageRating: "C18", formats: ["2D"], ratingCount: 8000, language: "Vietnamese", subtitles: null },
  { imdbId: "tt30611573", slug: "quy-cau", genreSlugs: ["horror", "thriller"], status: "NOW_SHOWING", ageRating: "C16", formats: ["2D"], ratingCount: 7000, language: "Vietnamese", subtitles: null },
  { imdbId: "tt31438076", slug: "dao-pho-va-piano", genreSlugs: ["drama", "romance"], status: "NOW_SHOWING", ageRating: "C13", formats: ["2D"], ratingCount: 6000, language: "Vietnamese", subtitles: null },
  { imdbId: "tt1757678", slug: "avatar-fire-and-ash", genreSlugs: ["sci-fi", "adventure", "fantasy"], status: "COMING_SOON", ageRating: "C13", formats: ["2D", "3D", "IMAX"], ratingCount: 0 },
  { imdbId: "tt10676052", slug: "fantastic-four-first-steps", genreSlugs: ["action", "sci-fi", "adventure"], status: "COMING_SOON", ageRating: "C13", formats: ["2D", "IMAX"], ratingCount: 0 },
  { imdbId: "tt9603208", slug: "mission-impossible-the-final-reckoning", genreSlugs: ["action", "thriller", "adventure"], status: "COMING_SOON", ageRating: "C13", formats: ["2D", "IMAX"], ratingCount: 0 },
  { imdbId: "tt5950044", slug: "superman-2025", genreSlugs: ["action", "sci-fi", "adventure"], status: "COMING_SOON", ageRating: "C13", formats: ["2D", "IMAX"], ratingCount: 0 },
  { imdbId: "tt20969586", slug: "thunderbolts", genreSlugs: ["action", "adventure", "thriller"], status: "COMING_SOON", ageRating: "C13", formats: ["2D", "IMAX"], ratingCount: 0 },
  { imdbId: "tt19850008", slug: "the-batman-part-ii", genreSlugs: ["action", "thriller", "drama"], status: "COMING_SOON", ageRating: "C16", formats: ["2D", "IMAX"], ratingCount: 0 },
  { imdbId: "tt22084616", slug: "spider-man-brand-new-day", genreSlugs: ["action", "sci-fi", "adventure"], status: "COMING_SOON", ageRating: "C13", formats: ["2D", "3D", "IMAX"], ratingCount: 0 },
  { imdbId: "tt31036941", slug: "jurassic-world-rebirth", genreSlugs: ["action", "sci-fi", "adventure"], status: "COMING_SOON", ageRating: "C13", formats: ["2D", "IMAX"], ratingCount: 0 },
  { imdbId: "tt26743210", slug: "how-to-train-your-dragon-2025", genreSlugs: ["fantasy", "adventure", "drama"], status: "COMING_SOON", ageRating: "P", formats: ["2D", "3D", "IMAX"], ratingCount: 0 },
];

function parseRuntime(rt) {
  if (!rt || rt === "N/A") return 120;
  const m = /^(\d+)\s*min$/i.exec(rt.trim());
  return m ? parseInt(m[1], 10) : 120;
}

function parseImdbRating(v) {
  if (!v || v === "N/A") return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 0;
}

async function fetchOne(entry) {
  const url = `${BASE}&i=${encodeURIComponent(entry.imdbId)}`;
  const res = await fetch(url);
  const j = await res.json();
  if (j.Response === "False") {
    return { ...entry, error: j.Error || "Unknown OMDb error" };
  }
  const actors = (j.Actors || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const released = j.Released && j.Released !== "N/A" ? new Date(j.Released).toISOString().slice(0, 10) : "2024-06-01";
  const poster = j.Poster && j.Poster !== "N/A" ? j.Poster : null;
  const banner =
    poster && /_V1_SX\d+\.jpg$/i.test(poster)
      ? poster.replace(/_V1_SX\d+\.jpg$/i, "_V1_SX1280.jpg")
      : poster;
  return {
    imdbId: entry.imdbId,
    slug: entry.slug,
    title: j.Title,
    originalTitle: j.Title,
    description: j.Plot && j.Plot !== "N/A" ? j.Plot : `${j.Title} (${j.Year})`,
    posterUrl: poster,
    bannerUrl: banner,
    trailerUrl: null,
    duration: parseRuntime(j.Runtime),
    releaseDate: released,
    director: j.Director && j.Director !== "N/A" ? j.Director : "—",
    castMembers: actors,
    language: entry.language || (j.Language && j.Language !== "N/A" ? j.Language.split(",")[0].trim() : "English"),
    subtitles: entry.subtitles !== undefined ? entry.subtitles : "Vietnamese",
    rating: parseImdbRating(j.imdbRating),
    ratingCount: entry.ratingCount,
    ageRating: entry.ageRating,
    formats: entry.formats,
    status: entry.status,
    genreSlugs: entry.genreSlugs,
  };
}

async function main() {
  const out = [];
  for (const e of ENTRIES) {
    const row = await fetchOne(e);
    out.push(row);
    console.log(row.slug, row.error || row.title);
    await new Promise((r) => setTimeout(r, 250));
  }
  const path = join(__dirname, "../prisma/data/movies-catalog.omdb.json");
  writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
  console.log("Wrote", path);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
