import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [newCount, legacyCount, lastNew] = await Promise.all([
    prisma.provinceNew.count(),
    prisma.provinceLegacy.count(),
    prisma.provinceNew.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { code: true, nameVi: true, updatedAt: true },
    }),
  ]);
  console.log({ provinceNew: newCount, provinceLegacy: legacyCount, lastUpdated: lastNew });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
