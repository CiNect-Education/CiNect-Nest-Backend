/**
 * Ticket products + Cinestar seat layout for demo rooms.
 * Run: node scripts/ensure-booking-ticket-layout.js
 */
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

const TICKET_PRODUCTS = [
  {
    code: 'ADULT_SINGLE',
    label_vi: 'NGƯỜI LỚN',
    label_en: 'Adult',
    sub_label_vi: 'ĐƠN',
    sub_label_en: 'Single',
    seats_per_unit: 1,
    default_price: 75000,
    sort_order: 1,
  },
  {
    code: 'CONCESSION_SINGLE',
    label_vi: 'HSSV-U22-GV',
    label_en: 'Student / U22 / Teacher',
    sub_label_vi: 'ĐƠN',
    sub_label_en: 'Single',
    seats_per_unit: 1,
    default_price: 49000,
    sort_order: 2,
  },
  {
    code: 'ADULT_DOUBLE',
    label_vi: 'NGƯỜI LỚN',
    label_en: 'Adult',
    sub_label_vi: 'ĐÔI',
    sub_label_en: 'Double',
    seats_per_unit: 2,
    default_price: 160000,
    sort_order: 3,
  },
];

const AISLE_AFTER = 6;
const ROW_LETTERS = 'ABCDEFGHIJKLMN'.split('');

function buildCinestarSeats() {
  const seats = [];

  for (let r = 0; r < 11; r++) {
    const row = ROW_LETTERS[r];
    for (let num = 1; num <= 20; num++) {
      const gridCol = num <= AISLE_AFTER ? num : num + 1;
      let type = 'STANDARD';
      let price = 75000;
      if (r >= 10) {
        type = 'VIP';
        price = 95000;
      }
      if (r === 0 && (num === 1 || num === 20)) {
        type = 'DISABLED';
        price = 49000;
      }
      seats.push({ rowLabel: row, number: num, gridCol, type, price });
    }
  }

  const rowL = 'L';
  for (let num = 1; num <= 17; num++) {
    const gridCol = num <= AISLE_AFTER ? num : num + 1;
    seats.push({ rowLabel: rowL, number: num, gridCol, type: 'STANDARD', price: 75000 });
  }

  const coupleRows = [
    { row: 'M', blocks: [1, 2, 4, 5] },
    { row: 'N', blocks: [2, 3, 4] },
  ];
  for (const { row, blocks } of coupleRows) {
    for (const blockNum of blocks) {
      const pairKey = `${row}-${blockNum}`;
      const leftNum = blockNum * 2 - 1;
      const rightNum = blockNum * 2;
      const gridCol = blockNum <= 3 ? blockNum * 2 - 1 : blockNum * 2 + 1;
      seats.push({
        rowLabel: row,
        number: leftNum,
        gridCol,
        type: 'COUPLE',
        price: 160000,
        pairKey,
      });
      seats.push({
        rowLabel: row,
        number: rightNum,
        gridCol: gridCol + 2,
        type: 'COUPLE',
        price: 160000,
        pairKey,
      });
    }
  }

  return seats;
}

async function ensureSchema(prisma) {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE ticket_product_code AS ENUM ('ADULT_SINGLE', 'CONCESSION_SINGLE', 'ADULT_DOUBLE');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ticket_products (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      code ticket_product_code NOT NULL UNIQUE,
      label_vi VARCHAR(128) NOT NULL,
      label_en VARCHAR(128) NOT NULL,
      sub_label_vi VARCHAR(32),
      sub_label_en VARCHAR(32),
      seats_per_unit INT NOT NULL DEFAULT 1,
      default_price DECIMAL(12, 2) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS hold_ticket_lines (
      hold_id TEXT NOT NULL REFERENCES holds(id) ON DELETE CASCADE,
      product_code ticket_product_code NOT NULL REFERENCES ticket_products(code),
      quantity INT NOT NULL,
      unit_price DECIMAL(12, 2) NOT NULL,
      PRIMARY KEY (hold_id, product_code)
    )
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS layout_template VARCHAR(32) NOT NULL DEFAULT 'GRID'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE seats ADD COLUMN IF NOT EXISTS grid_col INT
  `);
}

async function upsertTicketProducts(prisma) {
  for (const p of TICKET_PRODUCTS) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ticket_products (id, code, label_vi, label_en, sub_label_vi, sub_label_en, seats_per_unit, default_price, sort_order, is_active)
       VALUES ($1::text, $2::ticket_product_code, $3, $4, $5, $6, $7, $8, $9, TRUE)
       ON CONFLICT (code) DO UPDATE SET
         label_vi = EXCLUDED.label_vi,
         label_en = EXCLUDED.label_en,
         sub_label_vi = EXCLUDED.sub_label_vi,
         sub_label_en = EXCLUDED.sub_label_en,
         seats_per_unit = EXCLUDED.seats_per_unit,
         default_price = EXCLUDED.default_price,
         sort_order = EXCLUDED.sort_order`,
      randomUUID(),
      p.code,
      p.label_vi,
      p.label_en,
      p.sub_label_vi,
      p.sub_label_en,
      p.seats_per_unit,
      p.default_price,
      p.sort_order,
    );
  }
  console.log(`ticket_products: ${TICKET_PRODUCTS.length} rows`);
}

async function rebuildRoomLayout(prisma, room) {
  const bookingCount = await prisma.bookingItem.count({
    where: { showtime: { roomId: room.id } },
  });
  if (bookingCount > 0) {
    console.log(`skip layout rebuild for ${room.name} (${bookingCount} booking items)`);
    return;
  }

  await prisma.holdSeat.deleteMany({ where: { seat: { roomId: room.id } } });
  await prisma.seat.deleteMany({ where: { roomId: room.id } });

  const seeds = buildCinestarSeats();
  const created = new Map();

  for (const s of seeds) {
    const id = randomUUID();
    const key = `${s.rowLabel}-${s.number}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO seats (id, room_id, row_label, number, grid_col, type, status, is_aisle, price)
       VALUES ($1::text, $2::text, $3, $4, $5, $6::seat_type, 'AVAILABLE'::seat_status, FALSE, $7)`,
      id,
      room.id,
      s.rowLabel,
      s.number,
      s.gridCol,
      s.type,
      s.price,
    );
    created.set(key, id);
  }

  const paired = new Set();
  for (const s of seeds) {
    if (!s.pairKey || paired.has(s.pairKey)) continue;
    const mates = seeds.filter((x) => x.pairKey === s.pairKey);
    if (mates.length !== 2) continue;
    const idA = created.get(`${mates[0].rowLabel}-${mates[0].number}`);
    const idB = created.get(`${mates[1].rowLabel}-${mates[1].number}`);
    if (!idA || !idB) continue;
    await prisma.$executeRawUnsafe(`UPDATE seats SET pair_id = $1::text WHERE id = $2::text`, idB, idA);
    await prisma.$executeRawUnsafe(`UPDATE seats SET pair_id = $1::text WHERE id = $2::text`, idA, idB);
    paired.add(s.pairKey);
  }

  const maxGrid = Math.max(...seeds.map((s) => s.gridCol));
  const rowCount = new Set(seeds.map((s) => s.rowLabel)).size;
  await prisma.$executeRawUnsafe(
    `UPDATE rooms SET layout_template = 'CINESTAR_STANDARD', rows = $1, columns = $2, total_seats = $3 WHERE id = $4::text`,
    rowCount,
    maxGrid,
    seeds.length,
    room.id,
  );
  console.log(`rebuilt ${room.name}: ${seeds.length} seats (${rowCount} rows)`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureSchema(prisma);
    await upsertTicketProducts(prisma);

    const targetRooms = await prisma.room.findMany({
      where: {
        OR: [
          { name: { contains: 'Screen 2' } },
          { name: { contains: 'Phòng 1' } },
          { name: 'Rạp 01' },
        ],
      },
      select: { id: true, name: true },
    });

    for (const room of targetRooms) {
      await rebuildRoomLayout(prisma, room);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
