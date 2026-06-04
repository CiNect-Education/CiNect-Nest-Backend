/**
 * Remove test/demo rows created via admin CRUD or obsolete V2 catalog.
 * Usage: node scripts/delete-demo-data.mjs
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

const OBSOLETE_DEMO_SLUGS = [
  "avengers-secret-wars",
  "lat-mat-8-hoi-ket",
  "inside-out-3",
  "dune-part-three",
  "mai-2",
  "the-batman-2",
];

const realSlugs = [
  ...readFileSync("prisma/data/real-cinemas.seed.ts", "utf8").matchAll(/slug: '([^']+)'/g),
].map((m) => m[1]);

function isDemoSlug(slug) {
  const s = slug.toLowerCase();
  return (
    OBSOLETE_DEMO_SLUGS.includes(s) ||
    s.includes("demo") ||
    s.startsWith("test-") ||
    s.includes("admin-crud")
  );
}

async function purgeShowtimes(showtimeIds) {
  if (!showtimeIds.length) return { bookings: 0, holds: 0, showtimes: 0 };

  const bookings = await prisma.booking.findMany({
    where: { showtimeId: { in: showtimeIds } },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);

  let bookingsRemoved = 0;
  if (bookingIds.length) {
    await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.bookingSnack.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.bookingItem.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.pointsHistory.deleteMany({ where: { bookingId: { in: bookingIds } } });
    const deletedBookings = await prisma.booking.deleteMany({
      where: { id: { in: bookingIds } },
    });
    bookingsRemoved = deletedBookings.count;
  }

  const deletedHolds = await prisma.hold.deleteMany({
    where: { showtimeId: { in: showtimeIds } },
  });

  const deletedShowtimes = await prisma.showtime.deleteMany({
    where: { id: { in: showtimeIds } },
  });

  return {
    bookings: bookingsRemoved,
    holds: deletedHolds.count,
    showtimes: deletedShowtimes.count,
  };
}

async function purgeMovies(movieIds) {
  if (!movieIds.length) return { movies: 0 };

  const showtimes = await prisma.showtime.findMany({
    where: { movieId: { in: movieIds } },
    select: { id: true },
  });
  const st = await purgeShowtimes(showtimes.map((s) => s.id));

  await prisma.movieGenre.deleteMany({ where: { movieId: { in: movieIds } } });
  await prisma.review.deleteMany({ where: { movieId: { in: movieIds } } });
  const deleted = await prisma.movie.deleteMany({ where: { id: { in: movieIds } } });

  return { movies: deleted.count, ...st };
}

async function purgeCinemas(cinemaIds) {
  if (!cinemaIds.length) return { cinemas: 0 };

  const showtimes = await prisma.showtime.findMany({
    where: { cinemaId: { in: cinemaIds } },
    select: { id: true },
  });
  const st = await purgeShowtimes(showtimes.map((s) => s.id));

  await prisma.snack.deleteMany({ where: { cinemaId: { in: cinemaIds } } });
  await prisma.pricingRule.deleteMany({ where: { cinemaId: { in: cinemaIds } } });
  const deleted = await prisma.cinema.deleteMany({ where: { id: { in: cinemaIds } } });

  return { cinemas: deleted.count, ...st };
}

try {
  const demoMovies = await prisma.movie.findMany({
    where: {
      OR: [
        { isDeleted: true },
        { slug: { in: OBSOLETE_DEMO_SLUGS } },
        { slug: { contains: "demo" } },
        { slug: { contains: "test-" } },
        { slug: { contains: "admin-crud" } },
      ],
    },
    select: { id: true, slug: true, title: true },
  });

  const demoCinemas = await prisma.cinema.findMany({
    where: {
      OR: [
        { slug: { notIn: realSlugs } },
        { slug: { contains: "demo" } },
        { slug: { contains: "test-" } },
        { slug: { contains: "admin-crud" } },
      ],
    },
    select: { id: true, slug: true, name: true },
  });

  const cinemaIds = demoCinemas
    .filter((c) => !realSlugs.includes(c.slug) || isDemoSlug(c.slug))
    .map((c) => c.id);

  const movieIds = demoMovies.map((m) => m.id);

  console.log("Will delete:");
  console.log("  movies:", demoMovies.map((m) => m.slug));
  console.log(
    "  cinemas:",
    demoCinemas.filter((c) => cinemaIds.includes(c.id)).map((c) => c.slug)
  );

  const result = await prisma.$transaction(async () => {
    const cinemaResult = await purgeCinemas(cinemaIds);
    const movieResult = await purgeMovies(movieIds);
    return { cinemaResult, movieResult };
  });

  const remaining = {
    demoMovies: await prisma.movie.count({
      where: {
        OR: [
          { isDeleted: true },
          { slug: { contains: "demo" } },
          { slug: { contains: "test-" } },
        ],
      },
    }),
    orphanCinemas: await prisma.cinema.count({
      where: { slug: { notIn: realSlugs } },
    }),
  };

  console.log("\nDeleted:", JSON.stringify(result, null, 2));
  console.log("Remaining:", remaining);
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
