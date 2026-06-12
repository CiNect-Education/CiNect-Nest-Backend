import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CATALOG_PATH = join(__dirname, "../../prisma/data/movies-catalog.omdb.json");
export const DEFAULT_POSTER = "https://placehold.co/600x900/png?text=CiNect+Poster";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const TMDB_KEY = process.env.TMDB_API_KEY?.trim();
export const OMDB_KEY = process.env.OMDB_API_KEY?.trim() || "thewdb";
export const FETCH_DELAY_MS = Number(process.env.MOVIE_SYNC_DELAY_MS || 400);

const GENRE_SLUGS = new Set([
  "action",
  "comedy",
  "drama",
  "horror",
  "sci-fi",
  "romance",
  "animation",
  "thriller",
  "fantasy",
  "adventure",
]);

const VI_GENRE_MAP = [
  [/kinh dị|horror/i, "horror"],
  [/hài|comedy/i, "comedy"],
  [/hoạt hình|anime|animation/i, "animation"],
  [/phiêu lưu|adventure/i, "adventure"],
  [/hành động|action/i, "action"],
  [/tình cảm|romance/i, "romance"],
  [/tâm lý|chính kịch|drama/i, "drama"],
  [/khoa học|sci-?fi|viễn tưởng/i, "sci-fi"],
  [/giả tưởng|fantasy/i, "fantasy"],
  [/gay cấn|thriller/i, "thriller"],
  [/gia đình|family/i, "animation"],
];

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchText(url, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/json" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await sleep(600 * (i + 1));
    }
  }
  throw lastErr;
}

export function stripAccents(s) {
  return String(s)
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function slugify(title) {
  return stripAccents(String(title || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeTitleKey(title) {
  return stripAccents(String(title || ""))
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(lt|pd|pđ|vn|2d|3d|imax|t\d+|p|k)\b/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stronger key for deduplicating the same film under different slugs/titles. */
export function dedupeTitleKey(title) {
  let k = normalizeTitleKey(cleanDisplayTitle(title));
  k = k
    .replace(/\b(phim dien anh|phien ban moi|movie|the)\b/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  k = k
    .replace(/kumathong/g, "kumanthong")
    .replace(/dan uong/g, "dan duong")
    .replace(/soi chi o\b/g, "soi chi do")
    .replace(/vua inh\b/g, "vua dinh")
    .replace(/lau ai duoi ay bien/g, "lau dai duoi day bien")
    .replace(/ien ha\b/g, "dien ha");

  if (k.includes("doraemon") && k.includes("nobita")) return "doraemon nobita lau dai duoi day bien";
  if (k.includes("your name") || k.includes("ten cau la gi")) return "your name ten cau la gi";
  if (k.includes("gundam") && k.includes("hathaway") && k.includes("circe")) return "gundam hathaway circe";
  if (k.includes("gundam") && k.includes("hathaway")) return "gundam hathaway tia chop";
  if (k.includes("kumanthong")) return "kumanthong ac quy dan duong";

  return k;
}

export function cleanDisplayTitle(title) {
  return String(title || "")
    .replace(/\s*\(T\d+\)\s*$/i, "")
    .replace(/\s*\(P\)\s*$/i, "")
    .replace(/\s*LT\s*\(P\)\s*$/i, "")
    .replace(/\s*PĐ\s*\(K\)\s*$/i, "")
    .replace(/\s*LT\s*$/i, "")
    .replace(/\s*PĐ\s*$/i, "")
    .replace(/\s*\(K\)\s*$/i, "")
    .replace(/\s*PHIÊN BẢN MỚI\s*$/i, "")
    .replace(/\s*PHIM ĐIỆN ẢNH\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAgeRating(raw) {
  const t = String(raw || "").toUpperCase();
  if (t.includes("18") || t === "T18") return "C18";
  if (t.includes("16") || t === "T16") return "C16";
  if (t.includes("13") || t === "T13") return "C13";
  return "P";
}

export function mapGenreSlugs(...parts) {
  const text = parts.filter(Boolean).join(" ");
  const out = new Set();
  for (const [re, slug] of VI_GENRE_MAP) {
    if (re.test(text)) out.add(slug);
  }
  if (out.size === 0) out.add("drama");
  return [...out].filter((g) => GENRE_SLUGS.has(g));
}

export function parseMoveekDate(raw, now = new Date()) {
  const m = String(raw || "").match(/(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : now.getFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (!m[3] && candidate < startOfUtcDay(now)) {
    year += 1;
    return new Date(Date.UTC(year, month - 1, day));
  }
  return candidate;
}

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function resolveListingStatus(releaseDate, hintedStatus, now = new Date()) {
  const today = startOfUtcDay(now);
  const release = startOfUtcDay(releaseDate);
  if (release > today) return "COMING_SOON";
  if (hintedStatus === "COMING_SOON") return "NOW_SHOWING";
  return hintedStatus || "NOW_SHOWING";
}

function metaContent(html, property) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re) || html.match(new RegExp(`content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"));
  return m?.[1]?.trim() || null;
}

export function parseMoveekListing(html) {
  const items = [];
  const linkRe = /href=["']\/phim\/([^/"'?#]+)\/?["']/gi;
  const seen = new Set();
  let m;
  while ((m = linkRe.exec(html))) {
    const slug = m[1].trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    items.push({ source: "moveek", slug, title: slug.replace(/-/g, " "), status: "NOW_SHOWING" });
  }
  return items;
}

export function parseMoveekComingSoon(html) {
  const block = html.split(/PHIM VIỆT SẮP CHIẾU/i)[1]?.split(/CÔNG TY TNHH|ĐỐI TÁC|<footer/i)[0] || "";
  const titles = [...block.matchAll(/(?:^|\n)\s*([A-ZÀ-Ỹ][^\n<]{3,80})\s*(?:\n|$)/g)]
    .map((x) => cleanDisplayTitle(x[1].trim()))
    .filter((t) => t.length > 2 && !/^(Tp\.|Khu vực|Định dạng)/i.test(t));
  return titles.map((title) => ({
    source: "moveek-coming-soon",
    slug: slugify(title),
    title,
    status: "COMING_SOON",
  }));
}

export function parseMoveekDetail(html, slug) {
  const title = metaContent(html, "og:title")?.replace(/\s*[-|].*$/, "").trim() || slug;
  const description =
    metaContent(html, "og:description") ||
    metaContent(html, "description") ||
    `${title} — phim đang chiếu tại rạp Việt Nam.`;
  const posterUrl = metaContent(html, "og:image");
  const durationMatch = html.match(/Thời lượng\s*(\d+)\s*phút/i);
  const releaseMatch = html.match(/Khởi chiếu\s*([0-9/.]+)/i);
  const ageMatch = html.match(/Giới hạn tuổi\s*(T?\d+|P|K)/i);
  const directorMatch = html.match(/Đạo diễn\s*([^<\n]+)/i);
  const englishMatch = html.match(/#\s*[^\n]+\n+[^\n]+\n+([A-Za-z0-9:,'\-\s]+)\s*-\s*([^<\n]+)/);
  const genresText = englishMatch?.[2] || "";
  const releaseDate = parseMoveekDate(releaseMatch?.[1]) || new Date();
  return {
    title: cleanDisplayTitle(title),
    originalTitle: englishMatch?.[1]?.trim() || cleanDisplayTitle(title),
    description: description.trim(),
    posterUrl,
    bannerUrl: posterUrl,
    duration: durationMatch ? Number(durationMatch[1]) : 100,
    releaseDate: releaseDate.toISOString().slice(0, 10),
    director: directorMatch?.[1]?.trim() || "—",
    ageRating: parseAgeRating(ageMatch?.[1]),
    genreSlugs: mapGenreSlugs(genresText),
    language: /việt nam|vietnam/i.test(html) ? "Vietnamese" : undefined,
    subtitles: /việt nam|vietnam/i.test(genresText + title) ? null : "Vietnamese",
  };
}

export function parseCinestarShowtimes(html) {
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      const data = JSON.parse(nextMatch[1]);
      const movies = data?.props?.pageProps?.res?.listMovie ?? [];
      if (movies.length > 0) {
        return movies.map((m) => {
          const title = cleanDisplayTitle(m.name_vn || m.name_en || "");
          const releaseRaw = m.release_date?.split(" ")[0];
          const releaseDate = releaseRaw
            ? (() => {
                const parts = releaseRaw.split("/");
                if (parts.length === 3) {
                  const [month, day, year] = parts;
                  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
                }
                return null;
              })()
            : null;
          return {
            source: "cinestar",
            slug: slugify(title),
            title,
            originalTitle: cleanDisplayTitle(m.name_en || title),
            description: m.brief_vn || m.desc_vn || undefined,
            posterUrl: m.image || undefined,
            bannerUrl: m.himage || m.image || undefined,
            trailerUrl: m.trailer || undefined,
            duration: Number(m.time) || 100,
            releaseDate,
            director: m.director || undefined,
            castMembers: m.actor
              ? m.actor.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8)
              : undefined,
            ageRating: parseAgeRating(m.limitage_vn || m.limitage_en),
            genreSlugs: mapGenreSlugs(m.type_name_vn, m.type_name_en),
            language: m.language_vn === "VN" ? "Vietnamese" : m.language_en || undefined,
            status: m.status === "1" ? "COMING_SOON" : "NOW_SHOWING",
          };
        });
      }
    } catch {
      /* fall through to legacy regex */
    }
  }

  const text = html.replace(/<[^>]+>/g, " ");
  const re =
    /([A-ZÀ-Ỹ0-9][A-ZÀ-Ỹ0-9\s:\-'\.]{2,}?)\s*\(T(\d+|P|K)\)\s*([^0-9]{2,40}?)(\d{2,3})'/g;
  const items = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(text))) {
    const title = cleanDisplayTitle(m[1].trim());
    const key = normalizeTitleKey(title);
    if (!title || seen.has(key)) continue;
    seen.add(key);
    items.push({
      source: "cinestar",
      slug: slugify(title),
      title,
      ageRating: parseAgeRating(m[2]),
      genreSlugs: mapGenreSlugs(m[3]),
      duration: Number(m[4]) || 100,
      status: "NOW_SHOWING",
    });
  }
  return items;
}

export async function tmdbSearch(title, year) {
  if (!TMDB_KEY) return null;
  const q = encodeURIComponent(title);
  const y = year ? `&year=${year}` : "";
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${q}${y}&language=vi-VN`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return json.results?.[0] ?? null;
}

export async function tmdbDetails(id) {
  if (!TMDB_KEY || !id) return null;
  const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}&language=vi-VN&append_to_response=credits,videos,external_ids`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export async function tmdbRegionalList(type) {
  if (!TMDB_KEY) return [];
  const url = `https://api.themoviedb.org/3/movie/${type}?api_key=${TMDB_KEY}&region=VN&language=vi-VN&page=1`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.results ?? [];
}

export async function omdbByImdbId(imdbId) {
  if (!imdbId) return null;
  const url = `http://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${encodeURIComponent(imdbId)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return json.Response === "False" ? null : json;
}

export async function omdbByTitle(title, year) {
  if (!title) return null;
  const t = encodeURIComponent(title);
  const y = year ? `&y=${year}` : "";
  const url = `http://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${t}${y}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return json.Response === "False" ? null : json;
}

function tmdbPoster(path) {
  return path ? `https://image.tmdb.org/t/p/w500${path}` : null;
}

function tmdbBanner(path) {
  return path ? `https://image.tmdb.org/t/p/w1280${path}` : null;
}

export async function enrichMovie(stub, detail) {
  const title = detail?.title || stub.title;
  const year = (detail?.releaseDate || stub.releaseDate || "").slice(0, 4);
  const searchTitle = detail?.originalTitle && detail.originalTitle !== title ? detail.originalTitle : title;

  let tmdb = await tmdbSearch(searchTitle, year);
  if (!tmdb && searchTitle !== title) {
    tmdb = await tmdbSearch(title, year);
  }
  let tmdbFull = tmdb ? await tmdbDetails(tmdb.id) : null;
  const imdbId = tmdbFull?.imdb_id || tmdbFull?.external_ids?.imdb_id;
  let omdb = imdbId ? await omdbByImdbId(imdbId) : null;
  if (!omdb && !tmdbFull) {
    omdb = await omdbByTitle(searchTitle, year);
    if (!omdb && searchTitle !== title) omdb = await omdbByTitle(title, year);
  }

  const releaseDate =
    detail?.releaseDate ||
    (tmdbFull?.release_date && tmdbFull.release_date !== "0000-00-00" ? tmdbFull.release_date : null) ||
    (omdb?.Released && omdb.Released !== "N/A" ? new Date(omdb.Released).toISOString().slice(0, 10) : null) ||
    new Date().toISOString().slice(0, 10);

  const posterUrl =
    detail?.posterUrl ||
    stub.posterUrl ||
    tmdbPoster(tmdbFull?.poster_path) ||
    (omdb?.Poster && omdb.Poster !== "N/A" ? omdb.Poster : null) ||
    DEFAULT_POSTER;

  const bannerUrl =
    detail?.bannerUrl ||
    stub.bannerUrl ||
    tmdbBanner(tmdbFull?.backdrop_path) ||
    posterUrl;

  const castMembers =
    stub.castMembers?.length
      ? stub.castMembers
      : detail?.castMembers?.length
        ? detail.castMembers
        : tmdbFull?.credits?.cast?.slice(0, 8).map((c) => c.name) ||
          (omdb?.Actors && omdb.Actors !== "N/A" ? omdb.Actors.split(",").map((s) => s.trim()).slice(0, 8) : []);

  const trailer =
    stub.trailerUrl ||
    detail?.trailerUrl ||
    tmdbFull?.videos?.results?.find((v) => v.site === "YouTube" && v.type === "Trailer")?.key ||
    null;

  const genreSlugs =
    stub.genreSlugs?.length ? stub.genreSlugs : detail?.genreSlugs?.length ? detail.genreSlugs : mapGenreSlugs(
      ...(tmdbFull?.genres?.map((g) => g.name) || []),
      omdb?.Genre,
    );

  const duration =
    detail?.duration ||
    stub.duration ||
    (omdb?.Runtime && omdb.Runtime !== "N/A" ? parseInt(omdb.Runtime, 10) : null) ||
    tmdbFull?.runtime ||
    100;

  const imdbRating =
    omdb?.imdbRating && omdb.imdbRating !== "N/A"
      ? parseFloat(omdb.imdbRating)
      : tmdbFull?.vote_average
        ? Number(tmdbFull.vote_average)
        : null;
  const metacriticScore =
    omdb?.Metascore && omdb.Metascore !== "N/A" ? parseInt(omdb.Metascore, 10) : null;

  const slug = stub.slug || slugify(title);
  const hintedStatus = stub.status || detail?.status || "NOW_SHOWING";
  const status = resolveListingStatus(new Date(releaseDate), hintedStatus);

  return {
    imdbId: imdbId || omdb?.imdbID || undefined,
    slug,
    title: omdb?.Title || tmdbFull?.title || title,
    originalTitle: tmdbFull?.original_title || detail?.originalTitle || title,
    description:
      tmdbFull?.overview ||
      detail?.description ||
      (omdb?.Plot && omdb.Plot !== "N/A" ? omdb.Plot : `${title} — phim chiếu rạp.`),
    posterUrl,
    bannerUrl,
    trailerUrl: trailer,
    duration: Number.isFinite(duration) ? duration : 100,
    releaseDate,
    director:
      stub.director ||
      detail?.director ||
      tmdbFull?.credits?.crew?.find((c) => c.job === "Director")?.name ||
      (omdb?.Director && omdb.Director !== "N/A" ? omdb.Director : "—"),
    castMembers,
    language:
      detail?.language ||
      (omdb?.Language && omdb.Language !== "N/A" ? omdb.Language.split(",")[0].trim() : "English"),
    subtitles: detail?.subtitles !== undefined ? detail.subtitles : "Vietnamese",
    imdbRating:
      imdbRating != null && Number.isFinite(imdbRating)
        ? Math.min(10, Math.max(0, imdbRating))
        : undefined,
    metacriticScore:
      metacriticScore != null && Number.isFinite(metacriticScore)
        ? Math.min(100, Math.max(0, metacriticScore))
        : undefined,
    rating: 0,
    ratingCount: 0,
    ageRating: stub.ageRating || detail?.ageRating || "C13",
    formats: stub.formats || detail?.formats || ["2D"],
    status,
    genreSlugs,
    sources: [...new Set([stub.source].filter(Boolean))],
  };
}

export function loadCatalog() {
  if (!existsSync(CATALOG_PATH)) return [];
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

export function saveCatalog(rows) {
  writeFileSync(CATALOG_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

export function mergeCatalog(existing, incoming) {
  const bySlug = new Map(existing.map((r) => [r.slug, r]));
  const byKey = new Map(existing.map((r) => [dedupeTitleKey(r.title), r]));

  for (const row of incoming) {
    const prev = bySlug.get(row.slug) || byKey.get(dedupeTitleKey(row.title));
    if (prev) {
      bySlug.set(prev.slug, {
        ...prev,
        ...row,
        slug: prev.slug,
        imdbId: row.imdbId || prev.imdbId,
        trailerUrl: row.trailerUrl || prev.trailerUrl,
        ratingCount: Math.max(row.ratingCount || 0, prev.ratingCount || 0),
        sources: [...new Set([...(prev.sources || []), ...(row.sources || [])])],
      });
    } else {
      bySlug.set(row.slug, row);
    }
  }
  return [...bySlug.values()].sort((a, b) => a.title.localeCompare(b.title));
}
