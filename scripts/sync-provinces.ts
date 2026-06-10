/**
 * Sync provinces from provinces.open-api.vn (v2 new + v1 legacy) into DB.
 * Usage: npm run db:sync-provinces
 */
import { PrismaClient } from '@prisma/client';
import { syncProvincesFromOpenApi } from '../src/provinces/province-sync.logic';

const prisma = new PrismaClient();

async function main() {
  const result = await syncProvincesFromOpenApi(prisma);
  console.log(result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
