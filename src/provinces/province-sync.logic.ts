import type { PrismaClient } from '@prisma/client';
import {
  legacyMergedInto,
  loadOpenApiProvinceLists,
  resolveNewCodeFromLegacyApi,
  seedNameEn,
  v1CodenameToSlug,
  v2CodenameToCode,
} from './province-open-api.utils';

export type ProvinceSyncResult = {
  newUpserted: number;
  legacyUpserted: number;
  legacySkipped: number;
  source: 'provinces.open-api.vn';
  usedSnapshot: boolean;
  syncedAt: string;
};

export async function syncProvincesFromOpenApi(
  prisma: PrismaClient,
): Promise<ProvinceSyncResult> {
  const { v2Rows, v1Rows, usedSnapshot } = await loadOpenApiProvinceLists();

  if (v2Rows.length === 0) {
    throw new Error('No v2 provinces available to sync');
  }
  if (v1Rows.length === 0) {
    throw new Error('No v1 provinces available to sync');
  }

  const existingNew = await prisma.provinceNew.findMany({
    select: { code: true, nameEn: true },
  });
  const nameEnByCode = Object.fromEntries(
    existingNew.map((r) => [r.code, r.nameEn]),
  ) as Record<string, string>;

  let sortOrder = 0;
  for (const row of v2Rows) {
    sortOrder += 1;
    const code = v2CodenameToCode(row.codename);
    const nameVi = row.name.trim();
    const nameEn = nameEnByCode[code] ?? seedNameEn(code, nameVi);

    await prisma.provinceNew.upsert({
      where: { code },
      update: { nameVi, nameEn, sortOrder },
      create: { code, nameVi, nameEn, sortOrder },
    });
    nameEnByCode[code] = nameEn;
  }

  const provinceRows = await prisma.provinceNew.findMany({
    select: { id: true, code: true },
  });
  const provinceIdByCode = Object.fromEntries(
    provinceRows.map((r) => [r.code, r.id]),
  ) as Record<string, string>;

  const existingLegacy = await prisma.provinceLegacy.findMany({
    select: { code: true, nameEn: true },
  });
  const legacyNameEnByCode = Object.fromEntries(
    existingLegacy.map((r) => [r.code, r.nameEn]),
  ) as Record<string, string>;

  let legacyUpserted = 0;
  let legacySkipped = 0;

  for (const row of v1Rows) {
    const legacyCode = v1CodenameToSlug(row.codename);
    const nameVi = row.name.trim();

    let mergedCode =
      (await resolveNewCodeFromLegacyApi(row.code)) ??
      legacyMergedInto(legacyCode);

    if (!mergedCode) {
      legacySkipped += 1;
      continue;
    }

    const provinceNewId = provinceIdByCode[mergedCode];
    if (!provinceNewId) {
      legacySkipped += 1;
      continue;
    }

    const nameEn =
      legacyNameEnByCode[legacyCode] ?? seedNameEn(legacyCode, nameVi);

    await prisma.provinceLegacy.upsert({
      where: { code: legacyCode },
      update: { nameVi, nameEn, provinceNewId },
      create: { code: legacyCode, nameVi, nameEn, provinceNewId },
    });
    legacyUpserted += 1;
  }

  return {
    newUpserted: v2Rows.length,
    legacyUpserted,
    legacySkipped,
    source: 'provinces.open-api.vn',
    usedSnapshot,
    syncedAt: new Date().toISOString(),
  };
}
