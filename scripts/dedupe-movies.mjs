/**
 * Find and remove duplicate movies (same dedupeTitleKey).
 * Keeps the best row per group; reassigns FKs; soft-deletes losers.
 *
 * Run: node --use-system-ca scripts/dedupe-movies.mjs
 *      node --use-system-ca scripts/dedupe-movies.mjs --dry-run
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { cleanDisplayTitle, dedupeTitleKey, loadCatalog, saveCatalog } from "./lib/sync-movies-lib.mjs";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

function scoreMovie(m) {
  let s = 0;
  if (m.trailerUrl) s += 4;
  if (m.posterUrl && !/placehold\.co/i.test(m.posterUrl)) s += 3;
  if (m.bannerUrl && !/placehold\.co/i.test(m.bannerUrl)) s += 1;
  if (m.description && m.description.length > 80) s += 2;
  if (m.ratingCount > 100) s += 2;
  if (m.slug && m.slug.length < 55) s += 1;
  if (m.slug && !/^phim-ien-anh-/i.test(m.slug)) s += 2;
  if (m.originalTitle && m.originalTitle !== m.title) s += 1;
  return s;
}

function pickKeeper(rows) {
  return [...rows].sort((a, b) => {
    const diff = scoreMovie(b) - scoreMovie(a);
    if (diff !== 0) return diff;
    return (a.slug?.length || 0) - (b.slug?.length || 0);
  })[0];
}

async function reassignUniqueUserRows(model, fromId, toId) {
  const rows = await model.findMany({ where: { movieId: fromId } });
  for (const row of rows) {
    const conflict = await model.findFirst({
      where: { userId: row.userId, movieId: toId },
    });
    if (conflict) {
      await model.delete({ where: { id: row.id } });
    } else {
      await model.update({ where: { id: row.id }, data: { movieId: toId } });
    }
  }
}

async function reassignMovieId(fromId, toId) {
  await prisma.showtime.updateMany({ where: { movieId: fromId }, data: { movieId: toId } });
  await reassignUniqueUserRows(prisma.review, fromId, toId);
  await reassignUniqueUserRows(prisma.watchlistItem, fromId, toId);
  await prisma.communityPost.updateMany({ where: { movieId: fromId }, data: { movieId: toId } });
  await prisma.cinemaPhoto.updateMany({ where: { movieId: fromId }, data: { movieId: toId } });

  const dupGenres = await prisma.movieGenre.findMany({ where: { movieId: fromId } });
  for (const g of dupGenres) {
    await prisma.movieGenre.upsert({
      where: { movieId_genreId: { movieId: toId, genreId: g.genreId } },
      update: {},
      create: { movieId: toId, genreId: g.genreId },
    });
  }
  await prisma.movieGenre.deleteMany({ where: { movieId: fromId } });
}

function dedupeCatalog(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = dedupeTitleKey(row.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const kept = [];
  const removedSlugs = [];
  for (const [, group] of groups) {
    const keeper = pickKeeper(group);
    kept.push(keeper);
    for (const row of group) {
      if (row.slug !== keeper.slug) removedSlugs.push(row.slug);
    }
  }
  kept.sort((a, b) => a.title.localeCompare(b.title));
  return { kept, removedSlugs };
}

async function main() {
  const movies = await prisma.movie.findMany({
    where: { isDeleted: false },
  });

  const groups = new Map();
  for (const m of movies) {
    const key = dedupeTitleKey(m.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  const dupGroups = [...groups.entries()].filter(([, v]) => v.length > 1);
  console.log(`Active movies: ${movies.length}`);
  console.log(`Duplicate groups: ${dupGroups.length}`);

  if (dupGroups.length === 0) {
    console.log("No duplicates found.");
    return;
  }

  const toRemove = [];
  for (const [key, group] of dupGroups) {
    const keeper = pickKeeper(group);
    console.log(`\n[${key}] keep: ${keeper.slug} (${keeper.title})`);
    for (const m of group) {
      if (m.id === keeper.id) continue;
      console.log(`  remove: ${m.slug} (${m.title})`);
      toRemove.push({ dup: m, keeper });
    }
  }

  if (dryRun) {
    console.log(`\nDry run — would remove ${toRemove.length} duplicates`);
    return;
  }

  for (const { dup, keeper } of toRemove) {
    await reassignMovieId(dup.id, keeper.id);
    await prisma.movie.update({
      where: { id: dup.id },
      data: { isDeleted: true },
    });
  }

  const catalog = loadCatalog();
  const { kept, removedSlugs } = dedupeCatalog(catalog);
  saveCatalog(kept);

  const total = await prisma.movie.count({ where: { isDeleted: false } });
  console.log(`\nRemoved ${toRemove.length} duplicate movies (soft-deleted)`);
  console.log(`Catalog: ${catalog.length} → ${kept.length} (dropped ${removedSlugs.length} slugs)`);
  console.log(`Active movies in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
