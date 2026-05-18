import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(__dirname, "../prisma/data/movies-catalog.omdb.json"), "utf8"),
);

function normalize(url) {
  if (!url) return url;
  return url.replace(/@/g, "%40");
}

const p = new PrismaClient();
try {
  let n = 0;
  for (const row of catalog) {
    const posterUrl = normalize(row.posterUrl) ?? "";
    const bannerUrl = normalize(row.bannerUrl);
    await p.movie.updateMany({
      where: { slug: row.slug },
      data: { posterUrl, bannerUrl },
    });
    n++;
  }
  console.log(`Updated ${n} movies from catalog (Amazon URLs).`);
} finally {
  await p.$disconnect();
}
