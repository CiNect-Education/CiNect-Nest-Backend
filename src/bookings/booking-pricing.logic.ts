import { SeatType, TicketProductCode } from '@prisma/client';

export type SeatRow = {
  id: string;
  rowLabel: string;
  number: number;
  type: SeatType;
  pairId?: string | null;
};

export type TicketLineRow = {
  productCode: TicketProductCode;
  quantity: number;
  unitPrice: number;
};

export type SeatDisplayGroup = {
  kind: 'single' | 'couple';
  label: string;
  seatType: SeatType;
  seatIds: string[];
};

export function coupleBlockLabel(row: string, numbers: number[]): string {
  const minNum = Math.min(...numbers);
  const block = Math.ceil(minNum / 2);
  return `${row}${String(block).padStart(2, '0')}`;
}

/** Group physical seats for display (couple loveseat = one unit). */
export function groupSeatsForDisplay(seats: SeatRow[]): SeatDisplayGroup[] {
  const byId = new Map(seats.map((s) => [s.id, s]));
  const handled = new Set<string>();
  const groups: SeatDisplayGroup[] = [];

  for (const seat of seats) {
    if (handled.has(seat.id)) continue;

    if (seat.type === SeatType.COUPLE && seat.pairId) {
      const partner = byId.get(seat.pairId);
      if (partner) {
        handled.add(seat.id);
        handled.add(partner.id);
        const pair = [seat, partner].sort((a, b) => a.number - b.number);
        groups.push({
          kind: 'couple',
          label: coupleBlockLabel(seat.rowLabel, pair.map((p) => p.number)),
          seatType: SeatType.COUPLE,
          seatIds: pair.map((p) => p.id),
        });
        continue;
      }
    }

    handled.add(seat.id);
    groups.push({
      kind: 'single',
      label: `${seat.rowLabel}${seat.number}`,
      seatType: seat.type,
      seatIds: [seat.id],
    });
  }

  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

export function countDoubleTicketUnits(lines: TicketLineRow[]): number {
  return lines
    .filter((l) => l.productCode === TicketProductCode.ADULT_DOUBLE)
    .reduce((s, l) => s + l.quantity, 0);
}

export function countSingleTicketSlots(lines: TicketLineRow[]): number {
  return lines
    .filter((l) => l.productCode !== TicketProductCode.ADULT_DOUBLE)
    .reduce((s, l) => s + l.quantity * (l.productCode === TicketProductCode.ADULT_SINGLE || l.productCode === TicketProductCode.CONCESSION_SINGLE ? 1 : 0), 0);
}

/** Couple loveseat needs 1 vé đôi or 2 vé đơn (Cinestar-style). Vé đôi chỉ ghế đôi. */
export function validateTicketSeatCompatibility(
  lines: TicketLineRow[],
  seats: SeatRow[],
): string | null {
  const groups = groupSeatsForDisplay(seats);
  const doubleTickets = countDoubleTicketUnits(lines);
  const singleSlots = countSingleTicketSlots(lines);
  const displayUnits = doubleTickets + singleSlots;

  if (displayUnits > 0 && groups.length !== displayUnits) {
    return `Selected ${groups.length} seat unit(s) but tickets require ${displayUnits}`;
  }

  if (doubleTickets > 0 && singleSlots === 0) {
    if (groups.some((g) => g.kind !== 'couple')) {
      return 'Vé Người lớn · Đôi chỉ áp dụng cho ghế đôi';
    }
    if (groups.filter((g) => g.kind === 'couple').length !== doubleTickets) {
      return `Vui lòng chọn ${doubleTickets} ghế đôi`;
    }
  }

  if (singleSlots > 0 && doubleTickets === 0) {
    if (groups.some((g) => g.kind === 'couple')) {
      return 'Ghế đôi chỉ dành cho vé Người lớn · Đôi';
    }
  }

  let doubleLeft = doubleTickets;
  let singleLeft = singleSlots;

  for (const group of groups) {
    if (group.kind === 'couple') {
      if (doubleLeft > 0) {
        doubleLeft -= 1;
        continue;
      }
      if (singleLeft >= 2) {
        singleLeft -= 2;
        continue;
      }
      return 'Ghế đôi cần vé Người lớn · Đôi hoặc 2 vé Đơn tương ứng';
    }
    if (singleLeft > 0) {
      singleLeft -= 1;
      continue;
    }
    return 'Số ghế đã chọn không khớp với loại vé đã chọn';
  }

  const requiredPhysical = lines.reduce((sum, line) => {
    const perUnit =
      line.productCode === TicketProductCode.ADULT_DOUBLE ? 2 : 1;
    return sum + line.quantity * perUnit;
  }, 0);

  if (seats.length !== requiredPhysical) {
    return `Selected ${seats.length} seat(s) but tickets require ${requiredPhysical}`;
  }

  return null;
}

/** Apply concession discount ratio to a seat catalog price. */
export function applyTicketLineToSeatPrice(
  catalogPrice: number,
  productCode: TicketProductCode,
  ticketUnitPrice: number,
  standardBase: number,
): number {
  if (productCode === TicketProductCode.CONCESSION_SINGLE && standardBase > 0) {
    const ratio = ticketUnitPrice / standardBase;
    return Math.round(catalogPrice * ratio);
  }
  if (productCode === TicketProductCode.ADULT_DOUBLE) {
    return catalogPrice;
  }
  return catalogPrice;
}
