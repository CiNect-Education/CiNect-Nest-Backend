/**
 * Fix movie status: restore catalog intent from generate-movies-catalog, then apply release-date rules.
 * Run: node scripts/sync-movie-status.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, MovieStatus } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function resolveListingStatus(releaseDate, catalogStatus, now = new Date()) {
  const today = startOfUtcDay(now);
  const release = startOfUtcDay(releaseDate);
  if (release > today) return MovieStatus.COMING_SOON;
  if (catalogStatus === MovieStatus.COMING_SOON) return MovieStatus.NOW_SHOWING;
  return catalogStatus;
}

const catalogPath = join(__dirname, "../prisma/data/movies-catalog.omdb.json");
const generatorPath = join(__dirname, "generate-movies-catalog.mjs");
const generatorSrc = readFileSync(generatorPath, "utf8");

/** slug → intended status from curated ENTRIES in generate-movies-catalog.mjs */
const catalogIntent = Object.fromEntries(
  [...generatorSrc.matchAll(/slug:\s*"([^"]+)"[\s\S]*?status:\s*"(NOW_SHOWING|COMING_SOON|ENDED)"/g)].map(
    (m) => [m[1], m[2]],
  ),
);

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const now = new Date();
const counts = { COMING_SOON: 0, NOW_SHOWING: 0, ENDED: 0 };

for (const row of catalog) {
  const intent = catalogIntent[row.slug] ?? row.status;
  const status = resolveListingStatus(new Date(row.releaseDate), intent, now);
  row.status = status;
  counts[status]++;
}

writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log("Catalog status counts:", counts);

const prisma = new PrismaClient();
try {
  const movies = await prisma.movie.findMany({
    where: { isDeleted: false },
    select: { id: true, slug: true, releaseDate: true },
  });
  let updated = 0;
  for (const m of movies) {
    const intent = catalogIntent[m.slug] ?? MovieStatus.NOW_SHOWING;
    const next = resolveListingStatus(m.releaseDate, intent, now);
    const r = await prisma.movie.updateMany({
      where: { id: m.id, NOT: { status: next } },
      data: { status: next },
    });
    updated += r.count;
  }
  const dbCounts = await prisma.movie.groupBy({
    by: ["status"],
    where: { isDeleted: false },
    _count: true,
  });
  console.log({ updated, dbCounts });
} finally {
  await prisma.$disconnect();
}
