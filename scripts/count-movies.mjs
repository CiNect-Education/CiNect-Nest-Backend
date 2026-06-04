import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const ms = await p.movie.findMany({
  where: { isDeleted: false },
  select: { id: true, slug: true, title: true, trailerUrl: true },
});
console.log("count", ms.length);
console.log("with trailer", ms.filter((m) => m.trailerUrl).length);
await p.$disconnect();
