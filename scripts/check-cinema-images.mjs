import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const rows = await p.cinema.findMany({
    take: 5,
    select: { slug: true, name: true, imageUrl: true },
  });
  console.log("sample", rows);
  const empty = await p.cinema.count({
    where: { OR: [{ imageUrl: null }, { imageUrl: "" }] },
  });
  const total = await p.cinema.count();
  console.log({ total, empty });
} finally {
  await p.$disconnect();
}
