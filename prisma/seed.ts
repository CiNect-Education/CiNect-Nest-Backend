import { PrismaClient, UserRole, MovieStatus, AgeRating, RoomFormat, SeatType, SeatStatus, PromotionStatus, DiscountType, NewsCategory, GiftCardStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PROVINCES_NEW } from './data/provinces-new';
import { PROVINCES_LEGACY } from './data/provinces-legacy';
import { REAL_CINEMAS } from './data/real-cinemas.seed';
import moviesCatalogJson from './data/movies-catalog.omdb.json';
import movieWikiImages from './data/movie-wiki-images.json';
import moviePosterOverrides from './data/movie-poster-overrides.json';
import cinemaImagesBySlug from './data/cinema-images.json';
import { resolveListingStatus } from '../src/movies/movie-status.util';
import { normalizeImageUrl } from './lib/normalize-image-url';
import {
  SEED_SNACK_IMAGES,
  SEED_PROMOTION_IMAGES,
  SEED_NEWS_IMAGES,
  SEED_GIFT_CARD_IMAGES,
  SEED_CAMPAIGN_IMAGES,
} from './data/seed-media';
import { ALL_DEFAULT_TICKET_PRICE_TIERS } from './data/ticket-price-tiers.default';

const prisma = new PrismaClient();

type WikiImageEntry = { posterUrl: string; bannerUrl?: string };
const movieWikiByKey = {
  ...(movieWikiImages as Record<string, WikiImageEntry>),
  ...(moviePosterOverrides as Record<string, WikiImageEntry>),
};
const cinemaImages = cinemaImagesBySlug as Record<string, string>;

function cleanImageUrl(url: string | null | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    const u = new URL(url.trim());
    u.search = '';
    return u.toString();
  } catch {
    return url.split('?')[0] || undefined;
  }
}

function resolveMovieImages(row: { imdbId?: string; slug: string; posterUrl?: string; bannerUrl?: string }) {
  const wiki = (row.imdbId && movieWikiByKey[row.imdbId]) || movieWikiByKey[row.slug];
  const posterUrl =
    cleanImageUrl(wiki?.posterUrl) ?? normalizeImageUrl(row.posterUrl) ?? '';
  const bannerUrl =
    cleanImageUrl(wiki?.bannerUrl) ??
    cleanImageUrl(wiki?.posterUrl) ??
    normalizeImageUrl(row.bannerUrl);
  return { posterUrl, bannerUrl };
}

function resolveCinemaImageUrl(slug: string): string {
  const mapped = cinemaImages[slug];
  if (mapped?.trim()) return mapped.trim();
  return CINEMA_IMAGE_POOL[stableHash(slug) % CINEMA_IMAGE_POOL.length];
}

const CINEMA_IMAGE_POOL = [
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1460881680858-30d872d5b530?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1505686994434-e3cc5abf1330?auto=format&fit=crop&w=1600&q=80",
] as const;

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const GOOGLE_PLACES_TEXTSEARCH_API = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_PLACES_PHOTO_API = "https://maps.googleapis.com/maps/api/place/photo";
const imageCache = new Map<string, string>();

function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function resolveCinemaImage(slug: string): string {
  return CINEMA_IMAGE_POOL[stableHash(slug) % CINEMA_IMAGE_POOL.length];
}

async function fetchWikimediaImage(query: string): Promise<string | undefined> {
  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrlimit: "3",
      prop: "pageimages",
      piprop: "original|thumbnail",
      pithumbsize: "1600",
      format: "json",
      origin: "*",
    });
    const res = await fetch(`${WIKIMEDIA_API}?${params.toString()}`);
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      query?: { pages?: Record<string, { original?: { source?: string }; thumbnail?: { source?: string } }> };
    };
    const pages = Object.values(json.query?.pages ?? {});
    for (const p of pages) {
      const src = p.original?.source || p.thumbnail?.source;
      if (src && /^https?:\/\//i.test(src)) return src;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function fetchGooglePlaceImage(
  query: string,
  apiKey: string
): Promise<string | undefined> {
  try {
    const params = new URLSearchParams({
      query,
      language: "vi",
      region: "vn",
      key: apiKey,
    });
    const searchRes = await fetch(`${GOOGLE_PLACES_TEXTSEARCH_API}?${params.toString()}`);
    if (!searchRes.ok) return undefined;
    const searchJson = (await searchRes.json()) as {
      status?: string;
      results?: Array<{ photos?: Array<{ photo_reference?: string }> }>;
    };
    if (searchJson.status !== "OK" || !searchJson.results?.length) return undefined;

    const photoRef = searchJson.results[0]?.photos?.[0]?.photo_reference;
    if (!photoRef) return undefined;

    const photoParams = new URLSearchParams({
      maxwidth: "1600",
      photoreference: photoRef,
      key: apiKey,
    });
    const photoRes = await fetch(`${GOOGLE_PLACES_PHOTO_API}?${photoParams.toString()}`);
    if (!photoRes.ok) return undefined;
    return photoRes.url || undefined;
  } catch {
    return undefined;
  }
}

async function resolveCinemaImageReal(
  slug: string,
  name: string,
  address: string,
  city: string
): Promise<string> {
  const cached = imageCache.get(slug);
  if (cached) return cached;

  const queries = [
    `${name} ${city}`,
    `${name} cinema`,
    `${name} ${address}`,
    `${city} cinema exterior`,
  ];

  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (googleApiKey) {
    for (const q of queries) {
      const img = await fetchGooglePlaceImage(q, googleApiKey);
      if (img) {
        imageCache.set(slug, img);
        return img;
      }
    }
  }

  for (const q of queries) {
    const img = await fetchWikimediaImage(q);
    if (img) {
      imageCache.set(slug, img);
      return img;
    }
  }

  const fallback = resolveCinemaImage(slug);
  imageCache.set(slug, fallback);
  return fallback;
}

function appendIfMissing(parts: string[], value?: string): string[] {
  const v = (value || "").trim();
  if (!v) return parts;
  if (parts.some((p) => p.toLowerCase() === v.toLowerCase())) return parts;
  return [...parts, v];
}

function toFullAddress(address: string, ward?: string, district?: string, city?: string): string {
  let parts = (address || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  parts = appendIfMissing(parts, ward);
  parts = appendIfMissing(parts, district);
  parts = appendIfMissing(parts, city);
  return parts.join(", ");
}

async function main() {
  console.log('🌱 Starting seed...');

  // ============ ROLES ============
  console.log('Creating roles...');
  const adminRole = await prisma.role.upsert({
    where: { name: UserRole.ADMIN },
    update: {},
    create: { name: UserRole.ADMIN, permissions: ['*'] as object },
  });
  // Must match admin UI permission keys (dot-separated), e.g. movies.read
  const staffDefaultPermissions = [
    'movies.read',
    'movies.write',
    'cinemas.read',
    'rooms.read',
    'showtimes.read',
    'showtimes.write',
    'bookings.read',
    'bookings.write',
    'promotions.read',
    'pricing.read',
    'reports.read',
    'analytics.read',
  ];
  const staffRole = await prisma.role.upsert({
    where: { name: UserRole.STAFF },
    update: {},
    create: { name: UserRole.STAFF, permissions: staffDefaultPermissions as object },
  });
  const userRole = await prisma.role.upsert({
    where: { name: UserRole.USER },
    update: {},
    create: { name: UserRole.USER, permissions: [] as object },
  });

  // ============ MEMBERSHIP TIERS ============
  console.log('Creating membership tiers...');
  const tiersData = [
    { name: 'Bronze', level: 1, pointsRequired: 0, benefits: ['Welcome bonus 50 points', 'Birthday voucher'], discountPercent: 0, color: '#CD7F32' },
    { name: 'Silver', level: 2, pointsRequired: 1000, benefits: ['5% discount on tickets', 'Free size upgrade on combo', 'Birthday voucher'], discountPercent: 5, color: '#C0C0C0' },
    { name: 'Gold', level: 3, pointsRequired: 5000, benefits: ['10% discount on tickets', 'Priority booking', 'Free combo monthly', 'Birthday voucher'], discountPercent: 10, color: '#FFD700' },
    { name: 'Platinum', level: 4, pointsRequired: 15000, benefits: ['15% discount on tickets', 'VIP lounge access', 'Free combo weekly', 'Birthday voucher', 'Exclusive screenings'], discountPercent: 15, color: '#E5E4E2' },
  ];
  for (const t of tiersData) {
    await prisma.membershipTier.upsert({
      where: { name: t.name },
      update: {},
      create: { ...t, benefits: t.benefits as object },
    });
  }

  // ============ USERS ============
  console.log('Creating users...');
  const hashedPassword = await bcrypt.hash('Password@123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@cinect.vn' },
    update: {},
    create: {
      email: 'admin@cinect.vn',
      passwordHash: hashedPassword,
      fullName: 'Admin CiNect',
      phone: '0901234567',
      isActive: true,
      emailVerified: true,
      city: 'Ho Chi Minh',
      referralCode: 'CINADMIN01',
    },
  });
  await prisma.userRoleJoin.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: 'user@cinect.vn' },
    update: {},
    create: {
      email: 'user@cinect.vn',
      passwordHash: hashedPassword,
      fullName: 'Nguyen Van A',
      phone: '0912345678',
      isActive: true,
      emailVerified: true,
      city: 'Ho Chi Minh',
      referralCode: 'CINDEMO01',
    },
  });
  await prisma.userRoleJoin.upsert({
    where: { userId_roleId: { userId: demoUser.id, roleId: userRole.id } },
    update: {},
    create: { userId: demoUser.id, roleId: userRole.id },
  });

  // ============ GENRES ============
  console.log('Creating genres...');
  const genresData = [
    { name: 'Action', slug: 'action' },
    { name: 'Comedy', slug: 'comedy' },
    { name: 'Drama', slug: 'drama' },
    { name: 'Horror', slug: 'horror' },
    { name: 'Sci-Fi', slug: 'sci-fi' },
    { name: 'Romance', slug: 'romance' },
    { name: 'Animation', slug: 'animation' },
    { name: 'Thriller', slug: 'thriller' },
    { name: 'Fantasy', slug: 'fantasy' },
    { name: 'Adventure', slug: 'adventure' },
  ];
  const genres: Record<string, string> = {};
  for (const g of genresData) {
    const genre = await prisma.genre.upsert({
      where: { slug: g.slug },
      update: {},
      create: g,
    });
    genres[g.slug] = genre.id;
  }

  // ============ MOVIES ============
  /** OMDb-sourced catalog (regenerate: node scripts/generate-movies-catalog.mjs) */
  console.log('Creating movies...');
  const obsoleteDemoSlugs = [
    'avengers-secret-wars',
    'lat-mat-8-hoi-ket',
    'inside-out-3',
    'dune-part-three',
    'mai-2',
    'the-batman-2',
  ];
  // Do NOT hard-delete: may be referenced by historical bookings in an existing DB.
  await prisma.movie.updateMany({
    where: { slug: { in: obsoleteDemoSlugs } },
    data: { isDeleted: true },
  });
  type CatalogRow = (typeof moviesCatalogJson)[number] & { genreSlugs: string[]; imdbId?: string };
  const moviesData = (moviesCatalogJson as CatalogRow[]).map((row) => {
    const { imdbId: _imdb, genreSlugs, ...rest } = row;
    const images = resolveMovieImages(row);
    const releaseDate = new Date(row.releaseDate);
    return {
      ...rest,
      releaseDate,
      status: resolveListingStatus(releaseDate, row.status as MovieStatus),
      ageRating: row.ageRating as AgeRating,
      castMembers: row.castMembers as object,
      formats: row.formats as object,
      posterUrl: images.posterUrl,
      bannerUrl: images.bannerUrl,
      trailerUrl: row.trailerUrl ?? undefined,
      subtitles: row.subtitles ?? undefined,
      genreSlugs,
    };
  });

  const movieIds: Record<string, string> = {};
  for (const m of moviesData) {
    const { genreSlugs, ...movieData } = m;
    const movie = await prisma.movie.upsert({
      where: { slug: m.slug },
      update: {
        title: movieData.title,
        originalTitle: movieData.originalTitle,
        description: movieData.description,
        posterUrl: movieData.posterUrl,
        bannerUrl: movieData.bannerUrl,
        trailerUrl: movieData.trailerUrl,
        duration: movieData.duration,
        releaseDate: movieData.releaseDate,
        director: movieData.director,
        castMembers: movieData.castMembers,
        language: movieData.language,
        subtitles: movieData.subtitles,
        rating: movieData.rating,
        ratingCount: movieData.ratingCount,
        ageRating: movieData.ageRating,
        formats: movieData.formats,
        status: movieData.status,
      },
      create: movieData,
    });
    movieIds[m.slug] = movie.id;

    for (const slug of genreSlugs) {
      if (genres[slug]) {
        await prisma.movieGenre.upsert({
          where: { movieId_genreId: { movieId: movie.id, genreId: genres[slug] } },
          update: {},
          create: { movieId: movie.id, genreId: genres[slug] },
        });
      }
    }
  }

  // ============ PROVINCES (34 mới + 63 cũ) ============
  console.log('Creating provinces (new + legacy)...');
  for (const p of PROVINCES_NEW) {
    await prisma.provinceNew.upsert({
      where: { code: p.code },
      update: { nameVi: p.nameVi, nameEn: p.nameEn, sortOrder: p.sortOrder },
      create: {
        code: p.code,
        nameVi: p.nameVi,
        nameEn: p.nameEn,
        sortOrder: p.sortOrder,
      },
    });
  }
  const provinceRows = await prisma.provinceNew.findMany();
  const provinceIdByCode = Object.fromEntries(provinceRows.map((r) => [r.code, r.id])) as Record<string, string>;
  for (const L of PROVINCES_LEGACY) {
    const pid = provinceIdByCode[L.mergedInto];
    if (!pid) throw new Error(`Missing province new code for legacy ${L.code} -> ${L.mergedInto}`);
    await prisma.provinceLegacy.upsert({
      where: { code: L.code },
      update: { nameVi: L.nameVi, nameEn: L.nameEn, provinceNewId: pid },
      create: {
        code: L.code,
        nameVi: L.nameVi,
        nameEn: L.nameEn,
        provinceNewId: pid,
      },
    });
  }

  // ============ CINEMAS ============
  console.log('Creating cinemas (real addresses)...');
  const cinemaIds: Record<string, string> = {};
  for (const c of REAL_CINEMAS) {
    const provinceNewId = provinceIdByCode[c.provinceCode];
    if (!provinceNewId) throw new Error(`Unknown provinceCode ${c.provinceCode} for cinema ${c.slug}`);
    const imageUrl = resolveCinemaImageUrl(c.slug);
    const fullAddress = toFullAddress(c.address, c.ward, c.district, c.city);
    const cinema = await prisma.cinema.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        address: fullAddress,
        ward: c.ward ?? null,
        district: c.district ?? null,
        city: c.city,
        phone: c.phone ?? null,
        email: c.email ?? null,
        imageUrl,
        amenities: c.amenities as object,
        latitude: c.latitude,
        longitude: c.longitude,
        provinceNewId,
      },
      create: {
        name: c.name,
        slug: c.slug,
        address: fullAddress,
        ward: c.ward ?? null,
        district: c.district ?? null,
        city: c.city,
        phone: c.phone ?? null,
        email: c.email ?? null,
        imageUrl,
        amenities: c.amenities as object,
        latitude: c.latitude,
        longitude: c.longitude,
        provinceNewId,
      },
    });
    cinemaIds[c.slug] = cinema.id;
  }

  // ============ ROOMS & SEATS ============
  console.log('Creating rooms and seats...');
  const roomsData = [
    { cinemaSlug: 'cinect-landmark-81', name: 'Screen 1 - IMAX', format: RoomFormat.IMAX, rows: 10, columns: 16 },
    { cinemaSlug: 'cinect-landmark-81', name: 'Screen 2 - Standard', format: RoomFormat.STANDARD2D, rows: 8, columns: 12 },
    { cinemaSlug: 'cinect-landmark-81', name: 'Screen 3 - 4DX', format: RoomFormat.FOURDX, rows: 6, columns: 10 },
    { cinemaSlug: 'cinect-vincom-center', name: 'Screen 1 - Dolby', format: RoomFormat.DOLBY, rows: 8, columns: 14 },
    { cinemaSlug: 'cinect-vincom-center', name: 'Screen 2 - Standard', format: RoomFormat.STANDARD2D, rows: 8, columns: 12 },
    { cinemaSlug: 'cinect-royal-city', name: 'Screen 1 - IMAX', format: RoomFormat.IMAX, rows: 10, columns: 16 },
    { cinemaSlug: 'cinect-royal-city', name: 'Screen 2 - Standard', format: RoomFormat.STANDARD2D, rows: 8, columns: 12 },
  ];

  const roomIdsForShowtimes: string[] = [];
  const roomCinemaMap: Record<string, string> = {};
  for (const r of roomsData) {
    const cinemaId = cinemaIds[r.cinemaSlug];
    const totalSeats = r.rows * r.columns;

    const existing = await prisma.room.findUnique({
      where: { cinemaId_name: { cinemaId, name: r.name } },
    });

    let room;
    if (existing) {
      room = existing;
    } else {
      room = await prisma.room.create({
        data: {
          cinemaId,
          name: r.name,
          format: r.format,
          totalSeats,
          rows: r.rows,
          columns: r.columns,
        },
      });

      // Create seats
      const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const seats = [];
      for (let row = 0; row < r.rows; row++) {
        for (let col = 1; col <= r.columns; col++) {
          let seatType: SeatType = SeatType.STANDARD;
          let price = 85000;

          // Last 2 rows are VIP
          if (row >= r.rows - 2) {
            seatType = SeatType.VIP;
            price = 120000;
          }
          // First row: wheelchair accessible at edges
          if (row === 0 && (col === 1 || col === r.columns)) {
            seatType = SeatType.DISABLED;
            price = 70000;
          }

          seats.push({
            roomId: room.id,
            rowLabel: rowLabels[row],
            number: col,
            type: seatType,
            status: SeatStatus.AVAILABLE,
            isAisle: false,
            price,
          });
        }
      }
      await prisma.seat.createMany({ data: seats });
    }
    roomIdsForShowtimes.push(room.id);
    roomCinemaMap[room.id] = cinemaId;
  }

  // Default single screen for other cinemas (có ghế để có thể mở suất sau)
  const defaultRoomName = 'Phòng 1 - 2D';
  for (const c of REAL_CINEMAS) {
    if (c.seedFullRooms) continue;
    const cinemaId = cinemaIds[c.slug];
    const existingRoom = await prisma.room.findFirst({
      where: { cinemaId, name: defaultRoomName },
    });
    if (existingRoom) continue;
    const rows = 6;
    const columns = 10;
    const room = await prisma.room.create({
      data: {
        cinemaId,
        name: defaultRoomName,
        format: RoomFormat.STANDARD2D,
        totalSeats: rows * columns,
        rows,
        columns,
      },
    });
    const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const seats = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 1; col <= columns; col++) {
        seats.push({
          roomId: room.id,
          rowLabel: rowLabels[row],
          number: col,
          type: SeatType.STANDARD,
          status: SeatStatus.AVAILABLE,
          isAisle: false,
          price: 85000,
        });
      }
    }
    await prisma.seat.createMany({ data: seats });
  }

  // ============ SHOWTIMES ============
  console.log('Creating showtimes...');
  const today = new Date();
  // User requested: generate showtimes for ALL market movies (no size limit).
  // Strategy: for each room/day/slot pick an eligible movie deterministically.
  const daysToGenerate = 30;
  const allNowShowing = moviesData.filter((m) => m.status === MovieStatus.NOW_SHOWING);
  const comingSoonWindowEnd = new Date(today);
  comingSoonWindowEnd.setDate(comingSoonWindowEnd.getDate() + daysToGenerate);
  const allComingSoon = moviesData.filter(
    (m) => m.status === MovieStatus.COMING_SOON && m.releaseDate <= comingSoonWindowEnd
  );

  const roomRows = await prisma.room.findMany({
    where: { id: { in: roomIdsForShowtimes } },
    select: { id: true, format: true },
  });
  const roomFormatById = Object.fromEntries(roomRows.map((r) => [r.id, r.format])) as Record<
    string,
    RoomFormat
  >;

  function supportsRoomFormat(movieFormats: unknown, roomFormat: RoomFormat): boolean {
    const fmts = Array.isArray(movieFormats) ? movieFormats : [];
    const key =
      roomFormat === RoomFormat.STANDARD2D
        ? '2D'
        : roomFormat === RoomFormat.STANDARD3D
          ? '3D'
          : roomFormat === RoomFormat.FOURDX
            ? '4DX'
            : roomFormat;
    return fmts.includes(key);
  }

  function isWeekend(d: Date): boolean {
    const day = d.getDay();
    return day === 0 || day === 6;
  }

  function timeSlotsForDate(d: Date): Array<{ hour: number; min: number }> {
    // Typical VN cinema slots (weekend has an extra morning slot)
    return isWeekend(d)
      ? [
          { hour: 9, min: 30 },
          { hour: 12, min: 0 },
          { hour: 14, min: 30 },
          { hour: 17, min: 0 },
          { hour: 19, min: 30 },
          { hour: 22, min: 0 },
        ]
      : [
          { hour: 10, min: 0 },
          { hour: 13, min: 0 },
          { hour: 16, min: 0 },
          { hour: 19, min: 30 },
          { hour: 22, min: 0 },
        ];
  }

  function basePriceForFormat(format: RoomFormat, weekend: boolean): number {
    const w = weekend ? 1.15 : 1.0;
    if (format === RoomFormat.IMAX) return Math.round(150000 * w);
    if (format === RoomFormat.FOURDX) return Math.round(170000 * w);
    if (format === RoomFormat.DOLBY) return Math.round(120000 * w);
    if (format === RoomFormat.STANDARD3D) return Math.round(105000 * w);
    return Math.round(85000 * w);
  }

  // Clear existing schedules. (User requested: we can wipe transactional data.)
  await prisma.bookingItem.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.holdSeat.deleteMany();
  await prisma.hold.deleteMany();
  await prisma.showtime.deleteMany();

  for (let roomIdx = 0; roomIdx < roomIdsForShowtimes.length; roomIdx++) {
    const roomId = roomIdsForShowtimes[roomIdx];
    const cinemaId = roomCinemaMap[roomId];
    const roomFormat = roomFormatById[roomId] ?? RoomFormat.STANDARD2D;

    for (let dayOffset = 0; dayOffset <= daysToGenerate; dayOffset++) {
      const date = new Date(today);
      date.setDate(date.getDate() + dayOffset);
      const slots = timeSlotsForDate(date);

      for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
        const slot = slots[slotIdx];
        const startTime = new Date(date);
        startTime.setHours(slot.hour, slot.min, 0, 0);
        if (startTime <= today) continue;

        const poolNowShowing = allNowShowing.filter((m) => supportsRoomFormat(m.formats, roomFormat));
        const poolComingSoon = allComingSoon.filter(
          (m) => m.releaseDate <= startTime && supportsRoomFormat(m.formats, roomFormat)
        );
        const pool = poolNowShowing.length > 0 ? poolNowShowing : poolComingSoon;
        if (pool.length === 0) continue;

        // Deterministic selection: rotate by (roomIdx + dayOffset + slotIdx)
        const pick = pool[(roomIdx + dayOffset + slotIdx) % pool.length];
        const movieId = movieIds[pick.slug];
        if (!movieId) continue;

        const endTime = new Date(startTime.getTime() + (pick.duration || 120) * 60 * 1000);
        const weekend = isWeekend(date);
        const existingShowtime = await prisma.showtime.findFirst({
          where: { movieId, roomId, startTime },
        });
        if (existingShowtime) continue;

        const isVi = pick.language === 'Vietnamese';
        await prisma.showtime.create({
          data: {
            movieId,
            roomId,
            cinemaId,
            startTime,
            endTime,
            basePrice: basePriceForFormat(roomFormat, weekend),
            format: roomFormat,
            language: isVi ? 'Vietnamese' : 'English',
            subtitles: isVi ? undefined : 'Vietnamese',
          },
        });
      }
    }
  }

  // ============ PROMOTIONS ============
  console.log('Creating promotions...');
  const promotionsData = [
    {
      title: 'Student Discount - 20% Off',
      description: 'Show your student ID and get 20% off on all weekday screenings. Valid for all formats and movies.',
      code: 'STUDENT20',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      minPurchase: 0,
      maxDiscount: 50000,
      usageLimit: 1000,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
      imageUrl: SEED_PROMOTION_IMAGES.STUDENT20,
      conditions: 'Valid student ID required. Weekdays only.',
      status: PromotionStatus.ACTIVE,
      isTrending: true,
    },
    {
      title: 'Combo Deal - Buy 2 Get 1 Free',
      description: 'Purchase 2 movie tickets and get a free combo snack pack. Perfect for date nights!',
      code: 'COMBO2026',
      discountType: DiscountType.FIXED,
      discountValue: 50000,
      minPurchase: 150000,
      maxDiscount: 50000,
      usageLimit: 500,
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-03-31'),
      imageUrl: SEED_PROMOTION_IMAGES.COMBO2026,
      conditions: 'Minimum 2 tickets per transaction.',
      status: PromotionStatus.ACTIVE,
      isTrending: true,
    },
    {
      title: 'Valentine Special - 30% Off Couple Seats',
      description: 'Celebrate love with 30% discount on all couple seats throughout February.',
      code: 'LOVE2026',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 30,
      minPurchase: 200000,
      maxDiscount: 100000,
      usageLimit: 200,
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-02-28'),
      imageUrl: SEED_PROMOTION_IMAGES.LOVE2026,
      conditions: 'Couple seats only. Limited availability.',
      status: PromotionStatus.ACTIVE,
      isTrending: true,
    },
    {
      title: 'Weekend Family Pack',
      description: 'Get 15% off when buying 4 or more tickets on weekends. Bring the whole family!',
      code: 'FAMILY15',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 15,
      minPurchase: 300000,
      maxDiscount: 150000,
      usageLimit: 300,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      imageUrl: SEED_PROMOTION_IMAGES.FAMILY15,
      conditions: 'Minimum 4 tickets. Weekends only.',
      status: PromotionStatus.ACTIVE,
      isTrending: false,
    },
  ];

  for (const p of promotionsData) {
    await prisma.promotion.upsert({
      where: { code: p.code! },
      update: {
        title: p.title,
        description: p.description,
        imageUrl: p.imageUrl,
        discountType: p.discountType,
        discountValue: p.discountValue,
        minPurchase: p.minPurchase,
        maxDiscount: p.maxDiscount,
        usageLimit: p.usageLimit,
        startDate: p.startDate,
        endDate: p.endDate,
        conditions: p.conditions,
        status: p.status,
        isTrending: p.isTrending,
      },
      create: p,
    });
  }

  // ============ NEWS ARTICLES ============
  console.log('Creating news articles...');
  const newsData = [
    {
      title: 'Deadpool & Wolverine — kỷ lục phòng vé R-rated',
      slug: 'deadpool-wolverine-box-office-vn',
      excerpt: 'Phim MCU đầu tiên nhãn R ghi nhận suất chiếu đông khán giả tại các cụm rạp lớn.',
      content: 'Deadpool & Wolverine (Shawn Levy) đánh dấu sự trở lại của Wade Wilson bên cạnh Wolverine, với doanh thu toàn cầu vượt một tỷ USD. Tại Việt Nam, các suất tối và cuối tuần tại hệ thống rạp quốc tế thường kín chỗ ở định dạng IMAX và 2D phụ đề.',
      category: NewsCategory.GENERAL,
      imageUrl: SEED_NEWS_IMAGES['deadpool-wolverine-box-office-vn'],
      author: 'CiNect Editorial',
      tags: ['box office', 'marvel', 'deadpool'] as object,
    },
    {
      title: 'CiNect nâng cấp trải nghiệm IMAX tại Landmark 81',
      slug: 'cinect-imax-landmark-81',
      excerpt: 'Màn hình lớn và âm thanh đa kênh cho các bom tấn năm 2024–2025.',
      content: 'Chúng tôi mở rộng lịch chiếu các phim bom tấn như Dune: Part Two, Godzilla x Kong và các tác phẩm hoạt hình Pixar trên hệ thống IMAX. Thành viên ưu tiên đặt vé sớm qua ứng dụng CiNect.',
      category: NewsCategory.GENERAL,
      imageUrl: SEED_NEWS_IMAGES['cinect-imax-landmark-81'],
      author: 'CiNect PR Team',
      tags: ['IMAX', 'landmark 81', 'premium'] as object,
    },
    {
      title: 'Review: Inside Out 2 — Pixar và tuổi mới lớn',
      slug: 'review-inside-out-2',
      excerpt: 'Riley bước vào tuổi dậy thì; loạt cảm xúc mới lên màn ảnh.',
      content: 'Inside Out 2 mở rộng thế giới nội tâm với Anxiety và các cảm xúc mới, phù hợp khán gia đại chúng. Phần hoạt hình và nhịp hài đặc trưng Pixar được giữ vững. Đánh giá của chúng tôi: phim gia đình đáng xem trên màn rộng.',
      category: NewsCategory.REVIEWS,
      imageUrl: SEED_NEWS_IMAGES['review-inside-out-2'],
      author: 'Movie Reviewer',
      tags: ['review', 'pixar', 'animation'] as object,
    },
    {
      title: 'Sắp chiếu: Avatar: Fire and Ash — hành tinh Pandora trở lại',
      slug: 'avatar-fire-and-ash-preview',
      excerpt: 'Phần tiếp theo của loạt phim Avatar, kỳ vọng định dạng 3D/IMAX.',
      content: 'James Cameron tiếp tục mở rộng vũ trụ Pandora. Khán giả có thể theo dõi lịch chiếu và đặt vé sớm trên CiNect khi phim mở bán chính thức.',
      category: NewsCategory.TRAILERS,
      imageUrl: SEED_NEWS_IMAGES['avatar-fire-and-ash-preview'],
      author: 'CiNect Editorial',
      tags: ['avatar', 'preview', 'sci-fi'] as object,
    },
    {
      title: 'How to Get the Best Seats at CiNect - A Complete Guide',
      slug: 'guide-best-seats-cinect',
      excerpt: 'Tips and tricks for choosing the perfect seats for your next movie experience.',
      content: 'Finding the perfect seat can make or break your movie experience. For IMAX: sit in the center, about 2/3 back. For standard screens: the center rows offer the best viewing angle. VIP seats offer extra legroom and service. Couple seats are perfect for date nights with added privacy. Pro tip: Book early through the CiNect app to get the best selection, and use the seat map to find your ideal spot.',
      category: NewsCategory.GUIDES,
      imageUrl: SEED_NEWS_IMAGES['guide-best-seats-cinect'],
      author: 'CiNect Team',
      tags: ['guide', 'tips', 'seats'] as object,
    },
  ];

  for (const n of newsData) {
    await prisma.newsArticle.upsert({
      where: { slug: n.slug },
      update: {
        title: n.title,
        excerpt: n.excerpt,
        content: n.content,
        category: n.category,
        imageUrl: n.imageUrl,
        author: n.author,
        tags: n.tags,
      },
      create: n,
    });
  }

  // ============ SNACKS ============
  console.log('Creating snacks...');
  const snacksData = [
    { name: 'Popcorn (L)', description: 'Large butter popcorn', price: 55000, imageUrl: SEED_SNACK_IMAGES['Popcorn (L)'] },
    { name: 'Popcorn (M)', description: 'Medium butter popcorn', price: 40000, imageUrl: SEED_SNACK_IMAGES['Popcorn (M)'] },
    { name: 'Coca-Cola (L)', description: 'Large Coca-Cola', price: 35000, imageUrl: SEED_SNACK_IMAGES['Coca-Cola (L)'] },
    { name: 'Combo Couple', description: '2 Popcorn L + 2 Coca-Cola L', price: 150000, imageUrl: SEED_SNACK_IMAGES['Combo Couple'] },
    { name: 'Combo Family', description: '2 Popcorn L + 4 Drinks', price: 220000, imageUrl: SEED_SNACK_IMAGES['Combo Family'] },
    { name: 'Nachos', description: 'Nachos with cheese sauce', price: 60000, imageUrl: SEED_SNACK_IMAGES.Nachos },
    { name: 'Hot Dog', description: 'Classic hot dog', price: 45000, imageUrl: SEED_SNACK_IMAGES['Hot Dog'] },
    { name: 'Water Bottle', description: 'Mineral water 500ml', price: 15000, imageUrl: SEED_SNACK_IMAGES['Water Bottle'] },
  ];

  for (const cinemaSlug of Object.keys(cinemaIds)) {
    for (const s of snacksData) {
      const existing = await prisma.snack.findFirst({
        where: { cinemaId: cinemaIds[cinemaSlug], name: s.name },
      });
      if (existing) {
        await prisma.snack.update({
          where: { id: existing.id },
          data: {
            description: s.description,
            price: s.price,
            imageUrl: s.imageUrl,
          },
        });
      } else {
        await prisma.snack.create({
          data: { ...s, cinemaId: cinemaIds[cinemaSlug] },
        });
      }
    }
  }

  // ============ GIFT CARDS ============
  console.log('Creating gift cards...');
  const giftCardsData = [
    { title: 'Movie Night Gift Card', description: 'Perfect gift for movie lovers. Covers 1 standard ticket.', value: 100000, price: 90000, status: GiftCardStatus.AVAILABLE, imageUrl: SEED_GIFT_CARD_IMAGES['Movie Night Gift Card'] },
    { title: 'Premium Experience Gift Card', description: 'Enjoy a premium movie experience with VIP seats and snacks.', value: 300000, price: 270000, status: GiftCardStatus.AVAILABLE, imageUrl: SEED_GIFT_CARD_IMAGES['Premium Experience Gift Card'] },
    { title: 'Ultimate Cinema Package', description: 'The ultimate gift - covers 2 VIP tickets, combo snacks, and drinks.', value: 500000, price: 450000, status: GiftCardStatus.AVAILABLE, imageUrl: SEED_GIFT_CARD_IMAGES['Ultimate Cinema Package'] },
  ];

  for (const gc of giftCardsData) {
    const existing = await prisma.giftCard.findFirst({ where: { title: gc.title } });
    if (existing) {
      await prisma.giftCard.update({
        where: { id: existing.id },
        data: {
          description: gc.description,
          value: gc.value,
          price: gc.price,
          status: gc.status,
          imageUrl: gc.imageUrl,
        },
      });
    } else {
      await prisma.giftCard.create({ data: gc });
    }
  }

  // ============ PRICING RULES ============
  console.log('Creating pricing rules...');
  const pricingRulesData = [
    { name: 'Standard 2D - Weekday', seatType: SeatType.STANDARD, format: RoomFormat.STANDARD2D, dayType: 'WEEKDAY' as const, price: 85000 },
    { name: 'Standard 2D - Weekend', seatType: SeatType.STANDARD, format: RoomFormat.STANDARD2D, dayType: 'WEEKEND' as const, price: 100000 },
    { name: 'VIP 2D - Weekday', seatType: SeatType.VIP, format: RoomFormat.STANDARD2D, dayType: 'WEEKDAY' as const, price: 120000 },
    { name: 'VIP 2D - Weekend', seatType: SeatType.VIP, format: RoomFormat.STANDARD2D, dayType: 'WEEKEND' as const, price: 150000 },
    { name: 'IMAX - Weekday', seatType: SeatType.STANDARD, format: RoomFormat.IMAX, dayType: 'WEEKDAY' as const, price: 150000 },
    { name: 'IMAX - Weekend', seatType: SeatType.STANDARD, format: RoomFormat.IMAX, dayType: 'WEEKEND' as const, price: 180000 },
    { name: '4DX - Weekday', seatType: SeatType.STANDARD, format: RoomFormat.FOURDX, dayType: 'WEEKDAY' as const, price: 170000 },
    { name: '4DX - Weekend', seatType: SeatType.STANDARD, format: RoomFormat.FOURDX, dayType: 'WEEKEND' as const, price: 200000 },
  ];

  for (const pr of pricingRulesData) {
    const existing = await prisma.pricingRule.findFirst({ where: { name: pr.name } });
    if (!existing) {
      await prisma.pricingRule.create({ data: pr });
    }
  }

  // ============ TICKET PRICE TIERS (cinema detail bảng giá vé) ============
  console.log('Creating ticket price tiers...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ticket_price_tiers (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      cinema_id TEXT REFERENCES cinemas(id) ON DELETE CASCADE,
      format room_format NOT NULL,
      category_key VARCHAR(64) NOT NULL,
      slot_primary VARCHAR(255) NOT NULL,
      slot_secondary VARCHAR(255),
      subtitle VARCHAR(255),
      adult_price DECIMAL(12, 2) NOT NULL,
      concession_price DECIMAL(12, 2) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS ticket_price_tiers_cinema_format_idx
      ON ticket_price_tiers (cinema_id, format, is_active)
  `);

  const tierCount = await prisma.ticketPriceTier.count({ where: { cinemaId: null } });
  if (tierCount === 0) {
    await prisma.ticketPriceTier.createMany({
      data: ALL_DEFAULT_TICKET_PRICE_TIERS.map((t) => ({
        cinemaId: null,
        format: t.format,
        categoryKey: t.categoryKey,
        slotPrimary: t.slotPrimary,
        slotSecondary: t.slotSecondary ?? null,
        subtitle: t.subtitle ?? null,
        adultPrice: t.adultPrice,
        concessionPrice: t.concessionPrice,
        sortOrder: t.sortOrder,
        isActive: true,
      })),
    });
  }

  // ============ CAMPAIGNS ============
  console.log('Creating campaigns...');
  const campaignsData = [
    {
      title: 'Lunar New Year 2026',
      slug: 'lunar-new-year-2026',
      description: 'Celebrate Tet with special movie screenings, lucky draw prizes, and exclusive combos!',
      content: 'This Lunar New Year, CiNect brings you a festival of cinema. Enjoy special Tet-themed screenings, exclusive snack combos, and a chance to win gold coins in our lucky draw. All CiNect members earn double points on all purchases during the festival period.',
      imageUrl: SEED_CAMPAIGN_IMAGES['lunar-new-year-2026'],
      startDate: new Date('2026-01-25'),
      endDate: new Date('2026-02-15'),
      isActive: true,
    },
    {
      title: 'Summer Blockbuster Season',
      slug: 'summer-blockbusters-2026',
      description: 'The biggest movies of the year are coming this summer. Get ready!',
      content: 'Summer 2026 promises an incredible lineup of blockbusters. From superhero epics to animated adventures, there is something for everyone. Pre-book your tickets and save up to 25% with our early bird offers.',
      imageUrl: SEED_CAMPAIGN_IMAGES['summer-blockbusters-2026'],
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-08-31'),
      isActive: true,
    },
  ];

  for (const c of campaignsData) {
    await prisma.campaign.upsert({
      where: { slug: c.slug },
      update: {
        title: c.title,
        description: c.description,
        content: c.content,
        imageUrl: c.imageUrl,
        startDate: c.startDate,
        endDate: c.endDate,
        isActive: c.isActive,
      },
      create: c,
    });
  }

  // ============ HOME BANNERS (movie banners from catalog) ============
  console.log('Creating home banners...');
  const bannerMovies = [
    { slug: 'deadpool-wolverine', title: 'Deadpool & Wolverine' },
    { slug: 'inside-out-2', title: 'Inside Out 2' },
    { slug: 'dune-part-two', title: 'Dune: Part Two' },
  ];
  const homeBanners = bannerMovies.map((b, i) => {
    const row = (moviesCatalogJson as Array<{ slug: string; bannerUrl?: string; posterUrl?: string }>).find(
      (m) => m.slug === b.slug,
    );
    const images = row ? resolveMovieImages(row) : { posterUrl: '', bannerUrl: undefined };
    return {
      title: b.title,
      imageUrl: images.bannerUrl || images.posterUrl || CINEMA_IMAGE_POOL[i % CINEMA_IMAGE_POOL.length],
      linkUrl: `/movies/${b.slug}`,
      sortOrder: i + 1,
    };
  });
  for (const b of homeBanners) {
    const existing = await prisma.banner.findFirst({
      where: { position: 'home', title: b.title },
    });
    if (existing) {
      await prisma.banner.update({
        where: { id: existing.id },
        data: {
          imageUrl: b.imageUrl,
          linkUrl: b.linkUrl,
          sortOrder: b.sortOrder,
          isActive: true,
        },
      });
    } else {
      await prisma.banner.create({
        data: {
          title: b.title,
          imageUrl: b.imageUrl,
          linkUrl: b.linkUrl,
          position: 'home',
          sortOrder: b.sortOrder,
          isActive: true,
        },
      });
    }
  }

  console.log('✅ Seed completed successfully!');
  console.log('');
  console.log('📌 Test accounts:');
  console.log('   Admin: admin@cinect.vn / Password@123');
  console.log('   User:  user@cinect.vn / Password@123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
