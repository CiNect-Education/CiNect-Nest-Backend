import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const demoPatterns = ["demo", "test-", "admin-crud", "placeholder"];

try {
  const movies = await prisma.movie.findMany({
    where: {
      OR: [
        { isDeleted: true },
        ...demoPatterns.map((p) => ({ slug: { contains: p } })),
        ...demoPatterns.map((p) => ({ title: { contains: p, mode: "insensitive" } })),
      ],
    },
    select: { id: true, slug: true, title: true, isDeleted: true },
  });

  const cinemas = await prisma.cinema.findMany({
    where: {
      OR: demoPatterns.map((p) => ({
        OR: [
          { slug: { contains: p } },
          { name: { contains: p, mode: "insensitive" } },
        ],
      })),
    },
    select: { id: true, slug: true, name: true },
  });

  const news = await prisma.newsArticle.findMany({
    where: {
      OR: demoPatterns.map((p) => ({
        OR: [
          { slug: { contains: p } },
          { title: { contains: p, mode: "insensitive" } },
        ],
      })),
    },
    select: { id: true, slug: true, title: true },
  });

  const promos = await prisma.promotion.findMany({
    where: {
      OR: demoPatterns.map((p) => ({
        OR: [
          { code: { contains: p, mode: "insensitive" } },
          { title: { contains: p, mode: "insensitive" } },
        ],
      })),
    },
    select: { id: true, code: true, title: true },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      OR: demoPatterns.map((p) => ({
        bookingCode: { contains: p, mode: "insensitive" },
      })),
    },
    select: { id: true, bookingCode: true },
    take: 20,
  });

  console.log(
    JSON.stringify({ movies, cinemas, news, promos, bookings }, null, 2)
  );
} finally {
  await prisma.$disconnect();
}
