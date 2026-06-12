/**
 * Upsert Cinestar cinemas from cinestar.com.vn into DB.
 * Run: node --use-system-ca scripts/sync-cinestar-cinemas.mjs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { upsertCinestarCinemas } from "./lib/sync-cinestar-cinemas-lib.mjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Syncing Cinestar cinemas...");
  const cinemas = await upsertCinestarCinemas(prisma);
  console.log(`Upserted ${cinemas.length} Cinestar cinemas:`);
  for (const c of cinemas) console.log(`  - ${c.name} (${c.slug})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
