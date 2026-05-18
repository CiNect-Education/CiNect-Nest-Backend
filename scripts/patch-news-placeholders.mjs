/**
 * Replace placehold.co news images with real posters (Wikimedia / catalog).
 * Run: node scripts/patch-news-placeholders.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "../prisma/data");

const seedNews = JSON.parse(readFileSync(join(dataDir, "news-images.json"), "utf8"));
const wiki = JSON.parse(readFileSync(join(dataDir, "movie-wiki-images.json"), "utf8"));

const POSTER_POOL = [
  ...Object.values(wiki).map((w) => w.posterUrl),
  ...Object.values(seedNews),
].filter(Boolean);

const SLUG_MAP = {
  ...seedNews,
  "dune-part-three-preview":
    "https://upload.wikimedia.org/wikipedia/en/5/52/Dune_Part_Two_poster.jpeg",
  "review-inside-out-3":
    "https://upload.wikimedia.org/wikipedia/en/f/f7/Inside_Out_2_poster.jpg",
  "avengers-secret-wars-breaks-records":
    "https://upload.wikimedia.org/wikipedia/en/4/4c/Deadpool_%26_Wolverine_poster.jpg",
};

const TITLE_RULES = [
  { re: /dune/i, url: SLUG_MAP["dune-part-three-preview"] },
  { re: /inside out 3/i, url: SLUG_MAP["review-inside-out-3"] },
  { re: /inside out 2/i, url: seedNews["review-inside-out-2"] },
  { re: /deadpool|wolverine/i, url: seedNews["deadpool-wolverine-box-office-vn"] },
  { re: /avatar/i, url: seedNews["avatar-fire-and-ash-preview"] },
  { re: /imax|landmark/i, url: seedNews["cinect-imax-landmark-81"] },
  { re: /seat|ghế/i, url: seedNews["guide-best-seats-cinect"] },
  { re: /avengers|marvel/i, url: SLUG_MAP["avengers-secret-wars-breaks-records"] },
  { re: /godzilla|kong/i, url: wiki["tt14539740"]?.posterUrl },
  { re: /kung fu panda/i, url: wiki["tt21692408"]?.posterUrl },
  { re: /alien/i, url: wiki["tt18412256"]?.posterUrl },
  { re: /venom/i, url: wiki["tt16366836"]?.posterUrl },
  { re: /gladiator/i, url: wiki["tt9218128"]?.posterUrl },
  { re: /moana/i, url: wiki["tt13622970"]?.posterUrl },
];

function resolvePoster(slug, title) {
  if (SLUG_MAP[slug]) return SLUG_MAP[slug];
  for (const { re, url } of TITLE_RULES) {
    if (re.test(title) && url) return url;
  }
  const h = [...title].reduce((a, c) => a + c.charCodeAt(0), 0);
  return POSTER_POOL[h % POSTER_POOL.length];
}

const p = new PrismaClient();
try {
  const rows = await p.newsArticle.findMany({
    where: { imageUrl: { contains: "placehold.co" } },
    select: { id: true, slug: true, title: true },
  });

  let updated = 0;
  for (const row of rows) {
    const imageUrl = resolvePoster(row.slug, row.title);
    await p.newsArticle.update({ where: { id: row.id }, data: { imageUrl } });
    updated++;
  }

  const remaining = await p.newsArticle.count({
    where: { imageUrl: { contains: "placehold.co" } },
  });

  console.log({ placeholderArticles: rows.length, updated, remaining });
} finally {
  await p.$disconnect();
}
