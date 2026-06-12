/**
 * Sync real showtimes from VN ticket sites: Cinestar, Galaxy, Moveek (CGV/Lotte/Beta/...).
 *
 * Run: node --use-system-ca scripts/sync-showtimes-from-chains.mjs
 *      node --use-system-ca scripts/sync-showtimes-from-chains.mjs --dry-run
 */
import "dotenv/config";
import { PrismaClient, RoomFormat, SeatType, SeatStatus } from "@prisma/client";
import { fetchText, sleep } from "./lib/sync-movies-lib.mjs";
import { upsertCinestarCinemas } from "./lib/sync-cinestar-cinemas-lib.mjs";
import {
  SYNC_DAYS,
  buildMoveekCinemaCatalog,
  dedupeRows,
  extractMoveekMovieUuid,
  fetchCinestarRows,
  fetchGalaxyRows,
  fetchMoveekRowsForCinema,
  mapRoomFormat,
  matchDbCinema,
  matchDbMovie,
  supplementMissingMovies,
} from "./lib/sync-showtimes-lib.mjs";

import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, "../prisma/data/showtimes-sync-cache.json");

const dryRun = process.argv.includes("--dry-run");
const useCache = process.argv.includes("--use-cache");
const fetchOnly = process.argv.includes("--fetch-only");
const prisma = new PrismaClient();

const roomCache = new Map();

async function getDefaultRoom(cinemaId, formatKey) {
  const defaultName = "Phòng 1 - 2D";
  const key = `${cinemaId}|${defaultName}`;
  if (roomCache.has(key)) return roomCache.get(key);

  const format = mapRoomFormat(formatKey);
  let room = await prisma.room.findUnique({
    where: { cinemaId_name: { cinemaId, name: defaultName } },
  });

  if (!room) {
    const rows = 8;
    const cols = 12;
    room = await prisma.room.create({
      data: { cinemaId, name: defaultName, format, totalSeats: rows * cols, rows, columns: cols },
    });
    const rowLabels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const seats = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 1; c <= cols; c++) {
        seats.push({
          roomId: room.id,
          rowLabel: rowLabels[r],
          number: c,
          type: r >= rows - 2 ? SeatType.VIP : SeatType.STANDARD,
          status: SeatStatus.AVAILABLE,
          price: format === RoomFormat.IMAX ? 150000 : 85000,
        });
      }
    }
    await prisma.seat.createMany({ data: seats });
  }

  roomCache.set(key, room);
  return room;
}

async function clearFutureShowtimes() {
  const now = new Date();
  const booked = await prisma.booking.findMany({
    select: { showtimeId: true },
  });
  const protectedIds = new Set(booked.map((b) => b.showtimeId));

  const future = await prisma.showtime.findMany({
    where: { startTime: { gt: now }, isActive: true },
    select: { id: true },
  });
  const deletable = future.filter((s) => !protectedIds.has(s.id)).map((s) => s.id);
  if (!deletable.length) return 0;

  const BATCH = 5000;
  for (let i = 0; i < deletable.length; i += BATCH) {
    const chunk = deletable.slice(i, i + BATCH);
    await prisma.holdSeat.deleteMany({ where: { showtimeId: { in: chunk } } });
    await prisma.hold.deleteMany({ where: { showtimeId: { in: chunk } } });
    await prisma.showtime.deleteMany({ where: { id: { in: chunk } } });
  }
  return deletable.length;
}

async function upsertShowtimes(rows, dbMovies, dbCinemas) {
  const now = new Date();
  const existing = await prisma.showtime.findMany({
    where: { startTime: { gt: now } },
    select: { movieId: true, roomId: true, startTime: true },
  });
  const existingKeys = new Set(
    existing.map((s) => `${s.movieId}|${s.roomId}|${s.startTime.toISOString()}`),
  );

  const roomByCinema = new Map();
  const pending = [];
  let skipped = 0;

  for (const row of rows) {
    const movie = matchDbMovie(row.movieTitle, dbMovies);
    const cinema = matchDbCinema(row.cinemaName, dbCinemas);
    if (!movie || !cinema) {
      skipped++;
      continue;
    }

    let room = roomByCinema.get(cinema.id);
    if (!room) {
      room = await getDefaultRoom(cinema.id, row.format);
      roomByCinema.set(cinema.id, room);
    }

    const endTime = new Date(row.startTime.getTime() + (row.duration || 100) * 60 * 1000);
    const key = `${movie.id}|${room.id}|${row.startTime.toISOString()}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);

    pending.push({
      movieId: movie.id,
      cinemaId: cinema.id,
      roomId: room.id,
      startTime: row.startTime,
      endTime,
      basePrice: row.basePrice || 85000,
      format: room.format,
      language: row.language || "Vietnamese",
      subtitles: row.subtitles ?? undefined,
      isActive: true,
    });
  }

  let created = 0;
  const BATCH = 200;
  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    const result = await prisma.showtime.createMany({ data: chunk, skipDuplicates: true });
    created += result.count;
  }
  return { created, skipped };
}

async function main() {
  console.log("CiNect showtime sync from VN ticket chains");
  console.log(`Horizon: ${SYNC_DAYS} days`);

  const dbMovies = await prisma.movie.findMany({
    where: { isDeleted: false },
    select: { id: true, title: true, slug: true, duration: true, status: true },
  });
  const dbCinemas = await prisma.cinema.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, city: true },
  });
  const existingRooms = await prisma.room.findMany({
    select: { id: true, cinemaId: true, name: true, format: true },
  });
  for (const r of existingRooms) {
    roomCache.set(`${r.cinemaId}|${r.name}`, r);
  }
  console.log(`DB: ${dbMovies.length} movies, ${dbCinemas.length} cinemas, ${existingRooms.length} rooms`);

  const allRows = [];

  if (useCache && existsSync(CACHE_PATH)) {
    const cached = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    for (const row of cached) row.startTime = new Date(row.startTime);
    allRows.push(...cached);
    console.log(`Loaded ${allRows.length} slots from cache`);
  } else {
  console.log("\n[1/3] Cinestar showtimes...");
  try {
    const cinestar = await fetchCinestarRows();
    console.log(`  → ${cinestar.length} slots`);
    allRows.push(...cinestar);
  } catch (e) {
    console.warn("  ✗ Cinestar:", e.message);
  }

  console.log("[2/3] Galaxy Cinema showtimes...");
  try {
    const galaxy = await fetchGalaxyRows();
    console.log(`  → ${galaxy.length} slots`);
    allRows.push(...galaxy);
  } catch (e) {
    console.warn("  ✗ Galaxy:", e.message);
  }

  console.log("[3/3] Moveek API (CGV, Lotte, Beta, BHD, ...)");
  try {
    const seedSlug = dbMovies.find((m) => m.slug === "ma-xo")?.slug || dbMovies[0]?.slug;
    if (seedSlug) {
      const html = await fetchText(`https://moveek.com/phim/${seedSlug}/`);
      const seedUuid = extractMoveekMovieUuid(html);
      if (seedUuid) {
        const catalog = await buildMoveekCinemaCatalog(seedUuid);
        console.log(`  → ${catalog.size} Moveek cinemas discovered`);

        const pairs = [];
        for (const [, ext] of catalog) {
          const db = matchDbCinema(ext.name, dbCinemas);
          if (db) pairs.push({ db, ext });
        }
        console.log(`  → ${pairs.length} cinemas matched to DB`);

        for (let i = 0; i < pairs.length; i++) {
          const { db, ext } = pairs[i];
          process.stdout.write(`  [${i + 1}/${pairs.length}] ${ext.name}... `);
          const rows = await fetchMoveekRowsForCinema(ext.id);
          allRows.push(...rows);
          console.log(`${rows.length} slots`);
          await sleep(200);
        }
      } else {
        console.warn("  ✗ Could not resolve Moveek movie UUID");
      }
    }
  } catch (e) {
    console.warn("  ✗ Moveek:", e.message);
  }
  }

  const merged = dedupeRows(allRows);
  const supplemented = supplementMissingMovies(merged, dbMovies);
  const combined = dedupeRows([...merged, ...supplemented]);
  console.log(`\nReal slots: ${merged.length}, supplemented: ${supplemented.length}, total: ${combined.length}`);

  if (!fetchOnly && combined.length > 0) {
    const serializable = combined.map((r) => ({ ...r, startTime: r.startTime.toISOString() }));
    writeFileSync(CACHE_PATH, `${JSON.stringify(serializable)}\n`, "utf8");
    console.log(`Wrote cache ${CACHE_PATH} (${combined.length} slots)`);
  }

  if (fetchOnly) {
    console.log("Fetch-only — done");
    return;
  }

  if (dryRun) {
    const matched = combined.filter((r) => matchDbMovie(r.movieTitle, dbMovies) && matchDbCinema(r.cinemaName, dbCinemas));
    console.log(`Dry run — would upsert ~${matched.length} showtimes`);
    return;
  }

  console.log("\nEnsuring Cinestar cinemas in DB...");
  const cinestarCinemas = await upsertCinestarCinemas(prisma);
  console.log(`  → ${cinestarCinemas.length} Cinestar cinemas ready`);
  const dbCinemasFresh = await prisma.cinema.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, city: true },
  });

  const removed = await clearFutureShowtimes();
  console.log(`Removed ${removed} old future showtimes (no active bookings)`);

  const { created, skipped } = await upsertShowtimes(combined, dbMovies, dbCinemasFresh);
  const total = await prisma.showtime.count({ where: { isActive: true, startTime: { gt: new Date() } } });
  console.log(`Created ${created} showtimes (${skipped} skipped — no movie/cinema match)`);
  console.log(`Active future showtimes in DB: ${total}`);

  const withMovie = await prisma.showtime.groupBy({
    by: ["movieId"],
    where: { isActive: true, startTime: { gt: new Date() } },
    _count: true,
  });
  console.log(`Movies with ≥1 showtime: ${withMovie.length}/${dbMovies.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
