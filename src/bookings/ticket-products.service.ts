import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SeatType, TicketProductCode } from '@prisma/client';

@Injectable()
export class TicketProductsService {
  constructor(private readonly prisma: PrismaService) {}

  roomHasCoupleSeats(seats: { type: SeatType }[]): boolean {
    return seats.some((seat) => seat.type === SeatType.COUPLE);
  }

  async listForShowtime(showtimeId: string) {
    const showtime = await this.prisma.showtime.findFirst({
      where: { id: showtimeId, isActive: true },
      select: {
        basePrice: true,
        format: true,
        room: { select: { seats: { select: { type: true } } } },
      },
    });
    if (!showtime) return [];

    const products = await this.prisma.ticketProduct.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const hasCoupleSeats = this.roomHasCoupleSeats(showtime.room.seats);
    const eligibleProducts = hasCoupleSeats
      ? products
      : products.filter((p) => p.code !== TicketProductCode.ADULT_DOUBLE);

    const base = Number(showtime.basePrice);
    return eligibleProducts.map((p) => {
      const defaultPrice = Number(p.defaultPrice);
      const unitPrice =
        defaultPrice > 0
          ? defaultPrice
          : p.code === TicketProductCode.CONCESSION_SINGLE
            ? Math.round(base * 0.65)
            : p.code === TicketProductCode.ADULT_DOUBLE
              ? Math.round(base * 2.13)
              : base;
      return {
        code: p.code,
        labelVi: p.labelVi,
        labelEn: p.labelEn,
        subLabelVi: p.subLabelVi,
        subLabelEn: p.subLabelEn,
        seatsPerUnit: p.seatsPerUnit,
        unitPrice,
      };
    });
  }

  async getProductMap() {
    const products = await this.prisma.ticketProduct.findMany({
      where: { isActive: true },
    });
    return new Map(products.map((p) => [p.code, p]));
  }

  requiredSeatCount(
    lines: { productCode: TicketProductCode; quantity: number }[],
    productMap: Map<
      TicketProductCode,
      { seatsPerUnit: number }
    >,
  ): number {
    return lines.reduce((sum, line) => {
      const p = productMap.get(line.productCode);
      if (!p) return sum;
      return sum + line.quantity * p.seatsPerUnit;
    }, 0);
  }
}
