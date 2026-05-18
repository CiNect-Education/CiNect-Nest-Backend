import { PrismaClient } from "@prisma/client";

const UNSPLASH = (id, w = 800) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const PROMO_IMAGES = {
  STUDENT20: UNSPLASH("1489599849927-2ee91cede3ba"),
  COMBO2026: UNSPLASH("1517604931442-7e0c8ed2963c"),
  LOVE2026: UNSPLASH("1478720568477-152d9b164e26"),
  FAMILY15: UNSPLASH("1536440136628-849c177e76a1"),
};

const p = new PrismaClient();
try {
  for (const [code, imageUrl] of Object.entries(PROMO_IMAGES)) {
    await p.promotion.updateMany({ where: { code }, data: { imageUrl } });
  }

  const wikiMovies = await p.movie.findMany({
    where: { posterUrl: { contains: "wikimedia" } },
    select: { id: true, slug: true },
  });
  console.log(`Movies still on wikimedia: ${wikiMovies.length}`);

  const promos = await p.promotion.findMany({ select: { code: true, imageUrl: true } });
  console.log("Promotions:", promos);
} finally {
  await p.$disconnect();
}
