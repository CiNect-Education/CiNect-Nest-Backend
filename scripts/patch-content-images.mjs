/**
 * Patch promotion, news, and cinema images in DB from seed JSON files.
 * Run: node scripts/patch-content-images.mjs
 * Optional: FRONTEND_URL=http://localhost:3000 for absolute promo image URLs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "../prisma/data");

const frontendBase = (
  process.env.FRONTEND_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

const promoFiles = {
  STUDENT20: "student20.png",
  COMBO2026: "combo2026.png",
  LOVE2026: "love2026.png",
  FAMILY15: "family15.png",
};

const newsImages = JSON.parse(
  readFileSync(join(dataDir, "news-images.json"), "utf8"),
);
const cinemaImages = JSON.parse(
  readFileSync(join(dataDir, "cinema-images.json"), "utf8"),
);

const p = new PrismaClient();

try {
  let promos = 0;
  for (const [code, file] of Object.entries(promoFiles)) {
    const imageUrl = `${frontendBase}/media/promotions/${file}`;
    const r = await p.promotion.updateMany({
      where: { code },
      data: { imageUrl },
    });
    promos += r.count;
  }

  let news = 0;
  for (const [slug, imageUrl] of Object.entries(newsImages)) {
    const r = await p.newsArticle.updateMany({
      where: { slug },
      data: { imageUrl },
    });
    news += r.count;
  }

  const resolveCinemaUrl = (imageUrl) =>
    imageUrl.startsWith("/")
      ? `${frontendBase}${imageUrl}`
      : imageUrl;

  let cinemas = 0;
  for (const [slug, imageUrl] of Object.entries(cinemaImages)) {
    const r = await p.cinema.updateMany({
      where: { slug },
      data: { imageUrl: resolveCinemaUrl(imageUrl) },
    });
    cinemas += r.count;
  }

  console.log({
    promotionsUpdated: promos,
    newsUpdated: news,
    cinemasUpdated: cinemas,
    promoBase: frontendBase,
  });
} finally {
  await p.$disconnect();
}
