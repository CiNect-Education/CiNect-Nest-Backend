import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(__dirname, "../prisma/data/movies-catalog.omdb.json"), "utf8"),
);
const wiki = {
  ...JSON.parse(readFileSync(join(__dirname, "../prisma/data/movie-wiki-images.json"), "utf8")),
  ...JSON.parse(readFileSync(join(__dirname, "../prisma/data/movie-poster-overrides.json"), "utf8")),
};
const cinemas = JSON.parse(
  readFileSync(join(__dirname, "../prisma/data/cinema-images.json"), "utf8"),
);

function clean(url) {
  if (!url?.trim()) return undefined;
  try {
    const u = new URL(url.trim());
    u.search = "";
    return u.toString();
  } catch {
    return url.split("?")[0];
  }
}

function normAmazon(url) {
  if (!url) return undefined;
  return url.replace(/@/g, "%40");
}

const p = new PrismaClient();
try {
  let movies = 0;
  for (const row of catalog) {
    const w = wiki[row.imdbId];
    const posterUrl = clean(w?.posterUrl) ?? normAmazon(row.posterUrl) ?? "";
    const bannerUrl = clean(w?.bannerUrl) ?? clean(w?.posterUrl) ?? normAmazon(row.bannerUrl);
    const r = await p.movie.updateMany({
      where: { slug: row.slug },
      data: { posterUrl, bannerUrl },
    });
    movies += r.count;
  }

  let cinemaCount = 0;
  for (const [slug, imageUrl] of Object.entries(cinemas)) {
    const r = await p.cinema.updateMany({ where: { slug }, data: { imageUrl } });
    cinemaCount += r.count;
  }

  const emptyPosters = await p.movie.count({
    where: { isDeleted: false, posterUrl: "" },
  });
  console.log({ moviesUpdated: movies, cinemasUpdated: cinemaCount, emptyPosters });
} finally {
  await p.$disconnect();
}
