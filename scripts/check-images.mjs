import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const movies = await p.movie.findMany({
    where: { isDeleted: false },
    select: { slug: true, posterUrl: true },
    take: 8,
  });
  const emptyMovies = await p.movie.count({
    where: { isDeleted: false, OR: [{ posterUrl: "" }, { posterUrl: null }] },
  });
  const wikiMovies = await p.movie.count({
    where: { isDeleted: false, posterUrl: { contains: "wikimedia" } },
  });
  const promos = await p.promotion.findMany({
    select: { code: true, imageUrl: true },
  });
  const nullPromos = promos.filter((x) => !x.imageUrl?.trim()).length;
  const snacks = await p.snack.findMany({ take: 3, select: { imageUrl: true } });
  const cinemas = await p.cinema.findMany({ take: 3, select: { imageUrl: true } });
  const banners = await p.banner.findMany({ where: { position: "home" } });
  console.log(
    JSON.stringify(
      { emptyMovies, wikiMovies, nullPromos, movies, promos, snacks, cinemas, banners },
      null,
      2,
    ),
  );
} finally {
  await p.$disconnect();
}
