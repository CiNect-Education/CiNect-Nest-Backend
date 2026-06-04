/**
 * Sync home banner imageUrl from linked movie (bannerUrl || posterUrl).
 * Removes demo banners and fixes broken Amazon URLs.
 * Usage: node scripts/sync-home-banners.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalize(url) {
  if (!url?.trim()) return url;
  return url.trim().replace(/@/g, "%40");
}

try {
  const removed = await prisma.banner.deleteMany({
    where: {
      position: "home",
      OR: [
        { title: { equals: "Demo", mode: "insensitive" } },
        { linkUrl: { contains: "/movies/demo" } },
      ],
    },
  });

  const banners = await prisma.banner.findMany({
    where: { position: "home", isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  let updated = 0;
  for (const b of banners) {
    const match = b.linkUrl?.match(/\/movies\/([^/?#]+)/);
    if (!match) continue;

    const movie = await prisma.movie.findFirst({
      where: { slug: match[1], isDeleted: false },
      select: { bannerUrl: true, posterUrl: true, title: true },
    });
    if (!movie) continue;

    const imageUrl = normalize(movie.bannerUrl || movie.posterUrl);
    if (!imageUrl || imageUrl === b.imageUrl) continue;

    await prisma.banner.update({
      where: { id: b.id },
      data: { imageUrl, title: b.title || movie.title },
    });
    updated++;
    console.log(`updated: ${movie.title ?? match[1]}`);
  }

  console.log({ removed: removed.count, updated, total: banners.length });
} finally {
  await prisma.$disconnect();
}
