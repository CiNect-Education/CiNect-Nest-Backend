/**
 * Replace home carousel banners with CiNect AI banners (public/media/banners).
 * Run from cinect-nest-backend: node scripts/seed-cinect-home-banners.mjs
 * Optional: FRONTEND_URL=http://localhost:3000
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "../prisma/data");

/** Relative paths work on any FE host; set FRONTEND_URL only for absolute URLs if needed. */
const useAbsolute =
  process.env.BANNER_ABSOLUTE_URL === "1" || process.env.BANNER_ABSOLUTE_URL === "true";
const frontendBase = useAbsolute
  ? (
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000"
    ).replace(/\/$/, "")
  : "";

const entries = JSON.parse(
  readFileSync(join(dataDir, "home-banners.json"), "utf8"),
);

const prisma = new PrismaClient();

try {
  const deactivated = await prisma.banner.updateMany({
    where: { position: "home", isActive: true },
    data: { isActive: false },
  });

  let upserted = 0;
  for (const row of entries) {
    const imageUrl = `${frontendBase}/media/banners/${row.imageFile}`.replace(
      /\/+/g,
      "/",
    );
    const existing = await prisma.banner.findFirst({
      where: { position: "home", title: row.title },
    });

    if (existing) {
      await prisma.banner.update({
        where: { id: existing.id },
        data: {
          imageUrl,
          linkUrl: row.linkUrl,
          sortOrder: row.sortOrder,
          isActive: true,
        },
      });
    } else {
      await prisma.banner.create({
        data: {
          title: row.title,
          imageUrl,
          linkUrl: row.linkUrl,
          position: "home",
          sortOrder: row.sortOrder,
          isActive: true,
        },
      });
    }
    upserted++;
    console.log(`banner: ${row.title} -> ${imageUrl}`);
  }

  const active = await prisma.banner.findMany({
    where: { position: "home", isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { title: true, imageUrl: true, sortOrder: true },
  });

  console.log({
    deactivated: deactivated.count,
    upserted,
    active: active.length,
    frontendBase,
  });
} finally {
  await prisma.$disconnect();
}
