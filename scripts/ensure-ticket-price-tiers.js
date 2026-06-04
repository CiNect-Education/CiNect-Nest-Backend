/**
 * Creates ticket_price_tiers table and upserts all format tiers (2D, 3D, IMAX, 4DX, DOLBY).
 * Run: node scripts/ensure-ticket-price-tiers.js
 */
const { PrismaClient, RoomFormat } = require('@prisma/client');

const BASE_2D = [
  { categoryKey: 'happy_day', slotPrimary: "THỨ 2 (C'Monday)", slotSecondary: "THỨ 4 (C'Member)", adultPrice: 45000, concessionPrice: 45000, sortOrder: 1 },
  { categoryKey: 'happy_hour', slotPrimary: 'Trước 10:00', slotSecondary: 'Sau 22:00', subtitle: "C'Ten - Áp dụng cả tuần", adultPrice: 49000, concessionPrice: 49000, sortOrder: 2 },
  { categoryKey: 'weekday', slotPrimary: 'Thứ 3, 4, 5', adultPrice: 49000, concessionPrice: 49000, sortOrder: 3 },
  { categoryKey: 'weekend', slotPrimary: 'Thứ 6, 7, CN', adultPrice: 55000, concessionPrice: 49000, sortOrder: 4 },
  { categoryKey: 'holiday', slotPrimary: 'Theo quy định nghỉ Lễ, Tết', adultPrice: 60000, concessionPrice: 60000, sortOrder: 5 },
];

const SCALE = {
  [RoomFormat.STANDARD2D]: { adult: [1, 1, 1, 1, 1], concession: [1, 1, 1, 1, 1] },
  [RoomFormat.STANDARD3D]: { adult: [1.22, 1.2, 1.2, 1.18, 1.17], concession: [1.22, 1.2, 1.2, 1.2, 1.17] },
  [RoomFormat.IMAX]: { adult: [1.56, 1.63, 1.73, 1.64, 2], concession: [1.56, 1.63, 1.73, 1.63, 2] },
  [RoomFormat.FOURDX]: { adult: [1.78, 1.84, 1.94, 1.82, 2.17], concession: [1.78, 1.84, 1.94, 1.84, 2.17] },
  [RoomFormat.DOLBY]: { adult: [1.44, 1.51, 1.59, 1.55, 1.83], concession: [1.44, 1.51, 1.59, 1.55, 1.83] },
};

const FORMAT_ORDER = [
  RoomFormat.STANDARD2D,
  RoomFormat.STANDARD3D,
  RoomFormat.IMAX,
  RoomFormat.FOURDX,
  RoomFormat.DOLBY,
];

function roundPrice(n) {
  return Math.round(n / 1000) * 1000;
}

function buildAllTiers() {
  const out = [];
  for (const format of FORMAT_ORDER) {
    const s = SCALE[format];
    BASE_2D.forEach((row, i) => {
      out.push({
        format,
        categoryKey: row.categoryKey,
        slotPrimary: row.slotPrimary,
        slotSecondary: row.slotSecondary ?? null,
        subtitle: row.subtitle ?? null,
        adultPrice: roundPrice(row.adultPrice * s.adult[i]),
        concessionPrice: roundPrice(row.concessionPrice * s.concession[i]),
        sortOrder: row.sortOrder,
      });
    });
  }
  return out;
}

const ALL_DEFAULT = buildAllTiers();

async function main() {
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ticket_price_tiers (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      cinema_id TEXT REFERENCES cinemas(id) ON DELETE CASCADE,
      format room_format NOT NULL,
      category_key VARCHAR(64) NOT NULL,
      slot_primary VARCHAR(255) NOT NULL,
      slot_secondary VARCHAR(255),
      subtitle VARCHAR(255),
      adult_price DECIMAL(12, 2) NOT NULL,
      concession_price DECIMAL(12, 2) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS ticket_price_tiers_cinema_format_idx
      ON ticket_price_tiers (cinema_id, format, is_active)
  `);

  let created = 0;
  for (const tier of ALL_DEFAULT) {
    const existing = await prisma.ticketPriceTier.findFirst({
      where: {
        cinemaId: null,
        format: tier.format,
        categoryKey: tier.categoryKey,
      },
    });
    if (!existing) {
      await prisma.ticketPriceTier.create({
        data: {
          cinemaId: null,
          format: tier.format,
          categoryKey: tier.categoryKey,
          slotPrimary: tier.slotPrimary,
          slotSecondary: tier.slotSecondary,
          subtitle: tier.subtitle,
          adultPrice: tier.adultPrice,
          concessionPrice: tier.concessionPrice,
          sortOrder: tier.sortOrder,
          isActive: true,
        },
      });
      created += 1;
    }
  }

  const total = await prisma.ticketPriceTier.count({ where: { cinemaId: null } });
  console.log(`Ticket price tiers: ${total} global rows (${created} newly inserted)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
