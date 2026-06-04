import { PrismaClient } from "@prisma/client";

const BANNER =
  "https://upload.wikimedia.org/wikipedia/en/b/b0/Robert_Pattinson_Test_Footage_for_The_Batman_%28film%29.jpeg";
const POSTER =
  "https://upload.wikimedia.org/wikipedia/en/f/ff/The_Batman_%28film%29_poster.jpg";

const prisma = new PrismaClient();
try {
  const r = await prisma.movie.update({
    where: { slug: "the-batman-part-ii" },
    data: { bannerUrl: BANNER, posterUrl: POSTER },
  });
  console.log({ slug: r.slug, bannerUrl: r.bannerUrl, posterUrl: r.posterUrl });
} finally {
  await prisma.$disconnect();
}
