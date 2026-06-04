import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const banners = await p.banner.findMany({
  where: { position: "home", isActive: true },
  orderBy: { sortOrder: "asc" },
});
console.log(JSON.stringify(banners, null, 2));
const batman = await p.movie.findUnique({
  where: { slug: "the-batman-part-ii" },
  select: { title: true, status: true, bannerUrl: true, posterUrl: true },
});
console.log("batman:", batman);
await p.$disconnect();
