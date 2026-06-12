import {
  cleanDisplayTitle,
  dedupeTitleKey,
  fetchText,
  sleep,
  stripAccents,
} from "./sync-movies-lib.mjs";

export const MOVEEK_API = "https://api.moveek.com/v1";
export const MOVEEK_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json",
  Origin: "https://moveek.com",
};

export const SYNC_DAYS = Number(process.env.SHOWTIME_SYNC_DAYS || 7);
export const DETAIL_CONCURRENCY = Number(process.env.SHOWTIME_DETAIL_CONCURRENCY || 40);
export const FETCH_DELAY_MS = Number(process.env.SHOWTIME_SYNC_DELAY_MS || 120);

export function normText(s) {
  return stripAccents(String(s || "").toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cinemaTokens(name) {
  const stop = new Set([
    "cgv",
    "lotte",
    "cinema",
    "cinestar",
    "galaxy",
    "beta",
    "cineplex",
    "star",
    "vincom",
    "mall",
    "center",
    "plaza",
    "tp",
    "hcm",
    "hanoi",
    "ha",
    "noi",
    "tphcm",
  ]);
  return normText(name)
    .split(" ")
    .filter((t) => t.length > 2 && !stop.has(t));
}

export function cinemaMatchScore(a, b) {
  const ta = new Set(cinemaTokens(a));
  const tb = new Set(cinemaTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  let score = inter / Math.max(ta.size, tb.size);
  const na = normText(a);
  const nb = normText(b);
  if (na.includes(nb) || nb.includes(na)) score = Math.max(score, 0.72);
  return score;
}

/** DB slug → regex on Moveek cinema name */
export const CINEMA_ALIASES = [
  ["cinect-landmark-81", /landmark\s*81|vincom center landmark/i],
  ["cinect-vincom-center", /vincom dong khoi|vincom đồng khởi|dong khoi/i],
  ["cinect-royal-city", /lotte.*royal city|royal city/i],
  ["cgv-aeon-mall-long-bien", /aeon.*long bien|long bien/i],
  ["cgv-lotte-center-hanoi", /lotte center|lotte tower/i],
  ["cgv-bien-hoa", /bien hoa|biên hòa/i],
  ["cgv-hue", /vincom.*hue|huế/i],
  ["cgv-nha-trang", /nha trang/i],
  ["lotte-da-nang", /lotte.*da nang|đà nẵng/i],
  ["lotte-can-tho", /lotte.*can tho|cần thơ/i],
  ["galaxy-mipec-long-bien", /mipec|galaxy.*long bien/i],
  ["beta-da-lat", /beta.*da lat|đà lạt/i],
  ["bhd-star-discovery-da-nang", /bhd.*da nang|discovery/i],
  ["bhd-pham-van-thuan", /pham van thuan|phạm văn thuận/i],
  ["cinestar-quoc-thanh", /cinestar.*quoc thanh/i],
  ["cinestar-sinh-vien", /cinestar.*sinh vien|binh duong/i],
  ["cinestar-hue", /cinestar.*hue/i],
  ["cinestar-da-lat", /cinestar.*da lat/i],
  ["cinestar-lam-dong-duc-trong", /cinestar.*(lam dong|duc trong)/i],
  ["cinestar-my-tho", /cinestar.*my tho|tien giang/i],
  ["cinestar-kien-giang", /cinestar.*(kien giang|rach soi)/i],
  ["cinestar-satra-quan-6", /cinestar.*(satra|quan 6)/i],
  ["cinestar-parkcity-ha-noi", /cinestar.*parkcity/i],
];

export function matchDbCinema(externalName, dbCinemas) {
  const ext = normText(externalName);
  for (const [slug, re] of CINEMA_ALIASES) {
    if (re.test(ext)) {
      const hit = dbCinemas.find((c) => c.slug === slug);
      if (hit) return hit;
    }
  }
  let best = null;
  let bestScore = 0;
  for (const c of dbCinemas) {
    const s = cinemaMatchScore(c.name, externalName);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore >= 0.4 ? best : null;
}

export function parseCinestarSchedule(htmlOrRes) {
  const res =
    htmlOrRes?.dataShowtimes != null
      ? htmlOrRes
      : (() => {
          const nextMatch = String(htmlOrRes).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
          if (!nextMatch) return null;
          return JSON.parse(nextMatch[1])?.props?.pageProps?.res;
        })();
  if (!res?.dataShowtimes) return [];

  const rows = [];
  for (const movieBlock of Object.values(res.dataShowtimes)) {
    const movieTitle = cleanDisplayTitle(movieBlock.name_vn || movieBlock.name_en || "");
    const duration = Number(movieBlock.time_m || movieBlock.time) || 100;
    const format = movieBlock.formats_name_vn || "2D";
    for (const day of movieBlock.schedule || []) {
      const dateParts = String(day.date || "").split("/");
      if (dateParts.length !== 3) continue;
      const [dd, mm, yyyy] = dateParts;
      const dateIso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      for (const slot of day.times || []) {
        const [hh, mi] = String(slot.time || "0:0").split(":").map(Number);
        const start = new Date(`${dateIso}T${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00+07:00`);
        rows.push({
          source: "cinestar",
          externalKey: `cinestar:${slot.showtime_id}`,
          movieTitle,
          cinemaName: slot.theater_name_vn || slot.theater_name_en,
          roomName: `Phòng ${slot.room_name}`,
          startTime: start,
          duration,
          format,
          language: movieBlock.language_vn === "VN" ? "Vietnamese" : "English",
          subtitles: movieBlock.language_vn === "VN" ? undefined : "Vietnamese",
          basePrice: 85000,
        });
      }
    }
  }
  return rows;
}

export function parseGalaxySchedule(html) {
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nextMatch) return [];
  const data = JSON.parse(nextMatch[1]);
  const sessions = data?.props?.pageProps?.dataSessonAll?.data?.result;
  if (!Array.isArray(sessions)) return [];

  return sessions.map((s) => {
    const start = new Date(`${s.showDate}T${s.showTime}:00+07:00`);
    return {
      source: "galaxy",
      externalKey: `galaxy:${s.id}`,
      movieTitle: cleanDisplayTitle(s.movie?.name || ""),
      cinemaName: s.cinema?.name || "",
      roomName: `Phòng ${s.screenName || "1"}`,
      startTime: start,
      duration: Number(s.movie?.duration) || 100,
      format: s.movieFormat || s.version || "2D",
      language: /phụ đề|sub/i.test(s.movieFormat || "") ? "English" : "Vietnamese",
      subtitles: /phụ đề|sub/i.test(s.movieFormat || "") ? "Vietnamese" : undefined,
      basePrice: 90000,
    };
  });
}

export function extractMoveekMovieUuid(html) {
  const m = html.match(/\/tin-tuc\/[^/"']+\/([0-9a-f-]{36})/i);
  return m?.[1] || null;
}

export async function moveekFetchJson(path) {
  const url = path.startsWith("http") ? path : `${MOVEEK_API}${path}`;
  const res = await fetch(url, { headers: MOVEEK_HEADERS });
  if (!res.ok) throw new Error(`Moveek ${res.status} ${url}`);
  return res.json();
}

export async function moveekShowtimeDetail(id) {
  return moveekFetchJson(`/showtimes/${id}`);
}

export async function fetchMoveekDetails(ids, concurrency = DETAIL_CONCURRENCY) {
  const out = [];
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const rows = await Promise.all(batch.map((id) => moveekShowtimeDetail(id).catch(() => null)));
    out.push(...rows.filter(Boolean));
    if (FETCH_DELAY_MS > 0) await sleep(FETCH_DELAY_MS);
  }
  return out;
}

export function moveekDetailToRow(detail) {
  const start = new Date(detail.time);
  if (Number.isNaN(start.getTime())) return null;
  const hour = start.getHours();
  if (hour < 7 || hour > 23) return null;
  const fmt = String(detail.format || "2d");
  const language = /sub-en|en/i.test(fmt) ? "English" : "Vietnamese";
  const subtitles = /sub/i.test(fmt) ? "Vietnamese" : undefined;
  return {
    source: "moveek",
    externalKey: `moveek:${detail.id}`,
    movieTitle: cleanDisplayTitle(detail.movie?.name || ""),
    cinemaName: detail.cinema?.name || "",
    cinemaAdapter: detail.cinema?.adapter || "",
    moveekCinemaId: detail.cinema?.id || "",
    roomName: `Phòng ${detail.room || "1"}`,
    startTime: start,
    duration: 100,
    format: fmt,
    language,
    subtitles,
    basePrice: adapterPrice(detail.cinema?.adapter),
  };
}

function adapterPrice(adapter) {
  if (adapter === "cgv") return 110000;
  if (adapter === "lotte") return 105000;
  if (adapter === "galaxy") return 95000;
  if (adapter === "beta") return 75000;
  if (adapter === "cinestar") return 80000;
  return 85000;
}

export function mapRoomFormat(raw) {
  const t = String(raw || "").toLowerCase();
  if (t.includes("imax")) return "IMAX";
  if (t.includes("4dx")) return "FOURDX";
  if (t.includes("dolby")) return "DOLBY";
  if (t.includes("3d")) return "STANDARD3D";
  return "STANDARD2D";
}

export function isValidShowtime(start) {
  const now = new Date();
  if (start <= now) return false;
  const max = new Date(now);
  max.setDate(max.getDate() + SYNC_DAYS + 1);
  return start <= max;
}

let cinestarPageCache = null;

export async function fetchCinestarPage() {
  if (!cinestarPageCache) {
    const html = await fetchText("https://cinestar.com.vn/showtimes");
    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    cinestarPageCache = nextMatch ? JSON.parse(nextMatch[1])?.props?.pageProps?.res : null;
  }
  return cinestarPageCache;
}

export function resetCinestarPageCache() {
  cinestarPageCache = null;
}

export async function fetchCinestarRows() {
  const res = await fetchCinestarPage();
  return parseCinestarSchedule(res);
}

export async function fetchGalaxyRows() {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const html = await fetchText("https://galaxycine.vn/lich-chieu");
      return parseGalaxySchedule(html);
    } catch (err) {
      lastErr = err;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

export async function buildMoveekCinemaCatalog(seedMovieUuid) {
  const showdate = new Date().toISOString().slice(0, 10);
  const list = await moveekFetchJson(`/showtimes?movie_id=${seedMovieUuid}&showdate=${showdate}`);
  const sampleIds = list.slice(0, Math.min(list.length, 400)).map((s) => s.id);
  const details = await fetchMoveekDetails(sampleIds);
  const map = new Map();
  for (const d of details) {
    if (!d.cinema?.id) continue;
    map.set(d.cinema.id, {
      id: d.cinema.id,
      name: d.cinema.name,
      adapter: d.cinema.adapter,
    });
  }
  return map;
}

export async function fetchMoveekRowsForCinema(moveekCinemaId, days = SYNC_DAYS) {
  const rows = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const showdate = d.toISOString().slice(0, 10);
    const list = await moveekFetchJson(`/showtimes?cinema.id=${moveekCinemaId}&showdate=${showdate}`);
    if (!list.length) continue;
    const details = await fetchMoveekDetails(list.map((s) => s.id));
    for (const detail of details) {
      const row = moveekDetailToRow(detail);
      if (row) rows.push(row);
    }
    await sleep(FETCH_DELAY_MS);
  }
  return rows;
}

export function matchDbMovie(title, dbMovies) {
  const key = dedupeTitleKey(title);
  let hit = dbMovies.find((m) => dedupeTitleKey(m.title) === key);
  if (hit) return hit;

  for (const [re, slug] of MOVIE_TITLE_ALIASES) {
    if (re.test(cleanDisplayTitle(title))) {
      hit = dbMovies.find((m) => m.slug === slug);
      if (hit) return hit;
    }
  }
  return null;
}

/** Regex on chain title → DB movie slug */
export const MOVIE_TITLE_ALIASES = [
  [/he[- ]?man/i, "he-man-va-nhung-chien-binh-vu-tru"],
  [/tay du ky/i, "tay-du-ky-dai-nao"],
  [/your name|ten cau la gi/i, "your-name"],
  [/doraemon.*nobita/i, "doraemon-movie-45-2026-nobita-va-lau-dai-duoi-day-bien"],
  [/gundam.*hathaway/i, "mobile-suit-gundam-tia-chop-hathaway-ma-thuat-nu-than-circe"],
  [/mandalorian|grogu/i, "star-wars-the-mandalorian-and-grogu"],
  [/devil wears prada/i, "the-devil-wears-prada-2"],
];

/** Fill showtimes for catalog movies not listed on chain sites, using real slot times. */
export function supplementMissingMovies(realRows, dbMovies, slotsPerCinema = 6) {
  const covered = new Set();
  for (const r of realRows) {
    const m = matchDbMovie(r.movieTitle, dbMovies);
    if (m) covered.add(m.id);
  }

  const templatesByCinema = new Map();
  for (const row of realRows) {
    const c = normText(row.cinemaName);
    if (!templatesByCinema.has(c)) templatesByCinema.set(c, []);
    const list = templatesByCinema.get(c);
    const tk = row.startTime.toISOString();
    if (!list.some((x) => x.startTime.toISOString() === tk)) list.push(row);
  }

  const missing = dbMovies.filter(
    (m) => !covered.has(m.id) && (m.status === "NOW_SHOWING" || m.status === "COMING_SOON"),
  );
  const extra = [];

  for (const movie of missing) {
    for (const [, templates] of templatesByCinema) {
      const sample = [...templates].sort((a, b) => a.startTime - b.startTime).slice(0, slotsPerCinema);
      for (const t of sample) {
        extra.push({
          ...t,
          movieTitle: movie.title,
          source: "supplement",
          duration: movie.duration || t.duration || 100,
        });
      }
    }
  }
  return extra;
}

export function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!isValidShowtime(row.startTime)) continue;
    const k = `${dedupeTitleKey(row.movieTitle)}|${normText(row.cinemaName)}|${row.startTime.toISOString()}|${row.roomName}`;
    if (!map.has(k)) map.set(k, row);
  }
  return [...map.values()];
}
