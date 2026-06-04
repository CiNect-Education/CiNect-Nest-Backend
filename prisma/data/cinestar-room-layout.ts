import { randomUUID } from 'node:crypto';
import { SeatStatus, SeatType } from '@prisma/client';

export const CINESTAR_LAYOUT_TEMPLATE = 'CINESTAR_STANDARD';

type SeatSeed = {
  rowLabel: string;
  number: number;
  gridCol: number;
  type: SeatType;
  price: number;
  pairId?: string;
};

/** Aisle after physical column 6 (between 06 and 07). */
export const CINESTAR_AISLE_AFTER_COL = 6;

/**
 * Cinestar Rạp 01–style layout: rows A–N, aisle after col 6, sweetbox rows M–N.
 */
export function buildCinestarStandardSeats(): SeatSeed[] {
  const seats: SeatSeed[] = [];
  const rowLetters = 'ABCDEFGHIJKLMN'.split('');

  // Rows A–K (row L is built separately below)
  for (let r = 0; r < 11; r++) {
    const row = rowLetters[r];
    for (let num = 1; num <= 20; num++) {
      const gridCol = num <= CINESTAR_AISLE_AFTER_COL ? num : num + 1;
      let type: SeatType = SeatType.STANDARD;
      let price = 75000;
      if (r >= 10) {
        type = SeatType.VIP;
        price = 95000;
      }
      if (r === 0 && (num === 1 || num === 20)) {
        type = SeatType.DISABLED;
        price = 49000;
      }
      seats.push({ rowLabel: row, number: num, gridCol, type, price });
    }
  }

  // Row L — reduced center block (Cinestar L01-L02 gap L03-L04 gap L05-L17)
  const rowL = 'L';
  const lNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  for (const num of lNumbers) {
    const gridCol = num <= CINESTAR_AISLE_AFTER_COL ? num : num + 1;
    seats.push({
      rowLabel: rowL,
      number: num,
      gridCol,
      type: SeatType.STANDARD,
      price: 75000,
    });
  }

  // Rows M–N — couple / sweetbox (2 seats per block, displayed as M01, M02…)
  const coupleRows: { row: string; blocks: number[] }[] = [
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
        type: SeatType.COUPLE,
        price: 160000,
        pairId: pairKey,
      });
      seats.push({
        rowLabel: row,
        number: rightNum,
        gridCol: gridCol + 2,
        type: SeatType.COUPLE,
        price: 160000,
        pairId: pairKey,
      });
    }
  }

  return seats;
}

export function cinestarSeatRowsColumns(seats: SeatSeed[]) {
  const rows = new Set(seats.map((s) => s.rowLabel)).size;
  const maxGrid = Math.max(...seats.map((s) => s.gridCol));
  return { rows, columns: maxGrid, totalSeats: seats.length };
}

/** Creates seats and wires COUPLE pairId to partner seat id. */
export async function insertCinestarSeats(
  prisma: {
    seat: {
      create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
      update: (args: {
        where: { id: string };
        data: { pairId: string };
      }) => Promise<unknown>;
    };
  },
  roomId: string,
  seeds: SeatSeed[],
) {
  const created = new Map<string, string>();

  for (const s of seeds) {
    const key = `${s.rowLabel}-${s.number}`;
    const row = await prisma.seat.create({
      data: {
        id: randomUUID(),
        roomId,
        rowLabel: s.rowLabel,
        number: s.number,
        gridCol: s.gridCol,
        type: s.type,
        status: SeatStatus.AVAILABLE,
        isAisle: false,
        price: s.price,
      },
    });
    created.set(key, row.id);
  }

  const paired = new Set<string>();
  for (const s of seeds) {
    if (!s.pairId || paired.has(s.pairId)) continue;
    const mates = seeds.filter((x) => x.pairId === s.pairId);
    if (mates.length !== 2) continue;
    const idA = created.get(`${mates[0].rowLabel}-${mates[0].number}`);
    const idB = created.get(`${mates[1].rowLabel}-${mates[1].number}`);
    if (!idA || !idB) continue;
    await prisma.seat.update({ where: { id: idA }, data: { pairId: idB } });
    await prisma.seat.update({ where: { id: idB }, data: { pairId: idA } });
    paired.add(s.pairId);
  }
}
