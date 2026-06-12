/**
 * Refresh snack imageUrl in DB to match SEED_SNACK_IMAGES (public/media/snacks).
 * Usage: node scripts/update-snack-images.mjs
 */
import { PrismaClient } from "@prisma/client";

const FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const SNACK_IMAGES = {
  "Popcorn (L)": `${FRONTEND_URL}/media/snacks/popcorn-l.png`,
  "Popcorn (M)": `${FRONTEND_URL}/media/snacks/popcorn-m.png`,
  "Coca-Cola (L)": `${FRONTEND_URL}/media/snacks/coca-cola-l.png`,
  "Combo Couple": `${FRONTEND_URL}/media/snacks/combo-couple.png`,
  "Combo Family": `${FRONTEND_URL}/media/snacks/combo-family.png`,
  Nachos: `${FRONTEND_URL}/media/snacks/nachos.png`,
  "Hot Dog": `${FRONTEND_URL}/media/snacks/hot-dog.png`,
  "Water Bottle": `${FRONTEND_URL}/media/snacks/water-bottle.png`,
};

const prisma = new PrismaClient();

try {
  let updated = 0;
  for (const [name, imageUrl] of Object.entries(SNACK_IMAGES)) {
    const result = await prisma.snack.updateMany({
      where: { name },
      data: { imageUrl },
    });
    updated += result.count;
    console.log(`${name}: ${result.count} row(s)`);
  }
  console.log(`Done. Updated ${updated} snack row(s).`);
} finally {
  await prisma.$disconnect();
}
