import { TicketProductCode } from '@prisma/client';

export type TicketProductSeed = {
  code: TicketProductCode;
  labelVi: string;
  labelEn: string;
  subLabelVi: string;
  subLabelEn: string;
  seatsPerUnit: number;
  defaultPrice: number;
  sortOrder: number;
};

/** Cinestar-style ticket types (CHỌN LOẠI VÉ). */
export const TICKET_PRODUCTS_DEFAULT: TicketProductSeed[] = [
  {
    code: TicketProductCode.ADULT_SINGLE,
    labelVi: 'NGƯỜI LỚN',
    labelEn: 'Adult',
    subLabelVi: 'ĐƠN',
    subLabelEn: 'Single',
    seatsPerUnit: 1,
    defaultPrice: 75000,
    sortOrder: 1,
  },
  {
    code: TicketProductCode.CONCESSION_SINGLE,
    labelVi: 'HSSV-U22-GV',
    labelEn: 'Student / U22 / Teacher',
    subLabelVi: 'ĐƠN',
    subLabelEn: 'Single',
    seatsPerUnit: 1,
    defaultPrice: 49000,
    sortOrder: 2,
  },
  {
    code: TicketProductCode.ADULT_DOUBLE,
    labelVi: 'NGƯỜI LỚN',
    labelEn: 'Adult',
    subLabelVi: 'ĐÔI',
    subLabelEn: 'Double',
    seatsPerUnit: 2,
    defaultPrice: 160000,
    sortOrder: 3,
  },
];
