import { RoomFormat } from '@prisma/client';

export type TicketPriceTierSeed = {
  format: RoomFormat;
  categoryKey: string;
  slotPrimary: string;
  slotSecondary?: string;
  subtitle?: string;
  adultPrice: number;
  concessionPrice: number;
  sortOrder: number;
};

const BASE_2D: Omit<TicketPriceTierSeed, 'format'>[] = [
  {
    categoryKey: 'happy_day',
    slotPrimary: 'THỨ 2 (C\'Monday)',
    slotSecondary: 'THỨ 4 (C\'Member)',
    adultPrice: 45_000,
    concessionPrice: 45_000,
    sortOrder: 1,
  },
  {
    categoryKey: 'happy_hour',
    slotPrimary: 'Trước 10:00',
    slotSecondary: 'Sau 22:00',
    subtitle: 'C\'Ten - Áp dụng cả tuần',
    adultPrice: 49_000,
    concessionPrice: 49_000,
    sortOrder: 2,
  },
  {
    categoryKey: 'weekday',
    slotPrimary: 'Thứ 3, 4, 5',
    adultPrice: 49_000,
    concessionPrice: 49_000,
    sortOrder: 3,
  },
  {
    categoryKey: 'weekend',
    slotPrimary: 'Thứ 6, 7, CN',
    adultPrice: 55_000,
    concessionPrice: 49_000,
    sortOrder: 4,
  },
  {
    categoryKey: 'holiday',
    slotPrimary: 'Theo quy định nghỉ Lễ, Tết',
    adultPrice: 60_000,
    concessionPrice: 60_000,
    sortOrder: 5,
  },
];

/** Adult/concession multipliers vs 2D (aligned with pricing_rules ratios). */
const FORMAT_PRICE_SCALE: Record<
  RoomFormat,
  { adult: number[]; concession: number[] }
> = {
  [RoomFormat.STANDARD2D]: {
    adult: [1, 1, 1, 1, 1],
    concession: [1, 1, 1, 1, 1],
  },
  [RoomFormat.STANDARD3D]: {
    adult: [1.22, 1.2, 1.2, 1.18, 1.17],
    concession: [1.22, 1.2, 1.2, 1.2, 1.17],
  },
  [RoomFormat.IMAX]: {
    adult: [1.56, 1.63, 1.73, 1.64, 2],
    concession: [1.56, 1.63, 1.73, 1.63, 2],
  },
  [RoomFormat.FOURDX]: {
    adult: [1.78, 1.84, 1.94, 1.82, 2.17],
    concession: [1.78, 1.84, 1.94, 1.84, 2.17],
  },
  [RoomFormat.DOLBY]: {
    adult: [1.44, 1.51, 1.59, 1.55, 1.83],
    concession: [1.44, 1.51, 1.59, 1.55, 1.83],
  },
};

function roundPrice(n: number): number {
  return Math.round(n / 1_000) * 1_000;
}

function tiersForFormat(format: RoomFormat): TicketPriceTierSeed[] {
  const scale = FORMAT_PRICE_SCALE[format];
  return BASE_2D.map((row, i) => ({
    format,
    categoryKey: row.categoryKey,
    slotPrimary: row.slotPrimary,
    slotSecondary: row.slotSecondary,
    subtitle: row.subtitle,
    adultPrice: roundPrice(row.adultPrice * scale.adult[i]),
    concessionPrice: roundPrice(row.concessionPrice * scale.concession[i]),
    sortOrder: row.sortOrder,
  }));
}

export const TICKET_PRICE_FORMAT_ORDER: RoomFormat[] = [
  RoomFormat.STANDARD2D,
  RoomFormat.STANDARD3D,
  RoomFormat.IMAX,
  RoomFormat.FOURDX,
  RoomFormat.DOLBY,
];

export const ALL_DEFAULT_TICKET_PRICE_TIERS: TicketPriceTierSeed[] =
  TICKET_PRICE_FORMAT_ORDER.flatMap((f) => tiersForFormat(f));
