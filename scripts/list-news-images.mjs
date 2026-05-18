import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const rows = await p.newsArticle.findMany({
  select: { slug: true, title: true, imageUrl: true },
  orderBy: { publishedAt: "desc" },
});
console.log(rows);
await p.$disconnect();
