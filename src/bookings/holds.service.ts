import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TicketProductCode } from '@prisma/client';
import { TicketProductsService } from './ticket-products.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { mapRoomFormat } from '../common/helpers/format.helper';
import { HoldStatus } from '@prisma/client';

const holdCheckoutInclude = {
  holdSeats: { include: { seat: true } },
  holdTicketLines: { include: { product: true } },
  showtime: {
    include: {
      movie: { select: { title: true } },
      cinema: { select: { id: true, name: true } },
      room: { select: { name: true, format: true } },
    },
  },
} as const;

@Injectable()
export class HoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ws: WebsocketGateway,
    private readonly ticketProducts: TicketProductsService,
  ) {}

  getTtlMinutes(): number {
    return parseInt(this.config.get('HOLD_TTL_MINUTES') ?? '10', 10);
  }

  async create(
    showtimeId: string,
    userId: string,
    seatIds: string[],
    ticketLines?: { productCode: TicketProductCode; quantity: number }[],
  ) {
    const showtime = await this.prisma.showtime.findFirst({
      where: { id: showtimeId, isActive: true },
      include: { room: { include: { seats: true } } },
    });
    if (!showtime) {
      throw new NotFoundException('Showtime not found');
    }

    const seatById = new Map(showtime.room.seats.map((s) => [s.id, s]));
    for (const sid of seatIds) {
      if (!seatById.has(sid)) {
        throw new ConflictException(`Seat ${sid} does not belong to this showtime's room`);
      }
    }

    if (ticketLines?.length) {
      const productMap = await this.ticketProducts.getProductMap();
      const required = this.ticketProducts.requiredSeatCount(ticketLines, productMap);
      if (required !== seatIds.length) {
        throw new BadRequestException(
          `Selected ${seatIds.length} seat(s) but ticket types require ${required} seat(s)`,
        );
      }
      for (const code of ticketLines.map((l) => l.productCode)) {
        if (!productMap.has(code)) {
          throw new BadRequestException(`Unknown ticket product: ${code}`);
        }
      }
    }

    const selectedSeats = seatIds.map((id) => seatById.get(id)!);
    const selectedIds = new Set(seatIds);
    for (const seat of selectedSeats) {
      if (seat.type === 'COUPLE' && seat.pairId) {
        if (!selectedIds.has(seat.pairId)) {
          throw new BadRequestException(
            'Couple seats must be selected together (ĐÔI)',
          );
        }
      }
    }

    const now = new Date();
    const ttlMs = this.getTtlMinutes() * 60 * 1000;
    const expiresAt = new Date(now.getTime() + ttlMs);

    // Clean up stale hold seats to avoid unique constraint errors.
    // Stale = the hold is not ACTIVE anymore OR it is ACTIVE but already expired.
    const stale = await this.prisma.hold.findMany({
      where: {
        showtimeId,
        holdSeats: { some: { seatId: { in: seatIds } } },
        OR: [{ status: { not: HoldStatus.ACTIVE } }, { expiresAt: { lte: now } }],
      },
      include: { holdSeats: true },
    });
    if (stale.length > 0) {
      const staleHoldIds = stale.map((h) => h.id);
      const staleSeatIds = [...new Set(stale.flatMap((h) => h.holdSeats.map((hs) => hs.seatId)))];
      await this.prisma.$transaction([
        // Mark ACTIVE-but-expired holds as EXPIRED
        this.prisma.hold.updateMany({
          where: {
            id: { in: staleHoldIds },
            status: HoldStatus.ACTIVE,
            expiresAt: { lte: now },
          },
          data: { status: HoldStatus.EXPIRED },
        }),
        // Always remove their hold-seat rows
        this.prisma.holdSeat.deleteMany({ where: { holdId: { in: staleHoldIds } } }),
      ]);
      // Notify clients that seats are free again
      this.ws.emitHoldExpired(showtimeId, staleSeatIds);
    }

    const [heldSeats, bookedSeats] = await Promise.all([
      this.prisma.holdSeat.findMany({
        where: {
          showtimeId,
          seatId: { in: seatIds },
          hold: { status: HoldStatus.ACTIVE, expiresAt: { gt: now } },
        },
      }),
      this.prisma.bookingItem.findMany({
        where: {
          showtimeId,
          seatId: { in: seatIds },
          booking: { status: { not: 'CANCELLED' } },
        },
      }),
    ]);

    if (heldSeats.length > 0 || bookedSeats.length > 0) {
      throw new ConflictException('One or more seats are already held or booked');
    }

    const pricedTicketLines = await this.resolveTicketLinePrices(
      showtimeId,
      ticketLines,
    );

    const hold = await this.prisma.$transaction(async (tx) => {
      const h = await tx.hold.create({
        data: {
          userId,
          showtimeId,
          status: HoldStatus.ACTIVE,
          expiresAt,
        },
      });

      try {
        await tx.holdSeat.createMany({
          data: seatIds.map((seatId) => ({
            holdId: h.id,
            showtimeId,
            seatId,
          })),
        });
        if (pricedTicketLines.length > 0) {
          await tx.holdTicketLine.createMany({
            data: pricedTicketLines.map((line) => ({
              holdId: h.id,
              productCode: line.productCode,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            })),
          });
        }
      } catch {
        // Fallback: surface a clean conflict instead of a 500 in case of race conditions.
        throw new ConflictException('One or more seats are already held or booked');
      }

      return h;
    });

    const result = await this.prisma.hold.findUnique({
      where: { id: hold.id },
      include: holdCheckoutInclude,
    });
    this.ws.emitSeatHeld(showtimeId, seatIds);
    return this.mapHoldCheckout(result!);
  }

  async findOne(holdId: string, userId: string) {
    const hold = await this.prisma.hold.findUnique({
      where: { id: holdId },
      include: holdCheckoutInclude,
    });
    if (!hold) {
      throw new NotFoundException('Hold not found');
    }
    if (hold.userId !== userId) {
      throw new ForbiddenException('You can only view your own holds');
    }
    return this.mapHoldCheckout(hold);
  }

  private async resolveTicketLinePrices(
    showtimeId: string,
    ticketLines?: { productCode: TicketProductCode; quantity: number }[],
  ) {
    if (!ticketLines?.length) return [];
    const catalog = await this.ticketProducts.listForShowtime(showtimeId);
    const priceByCode = new Map(
      catalog.map((p) => [p.code as TicketProductCode, p.unitPrice]),
    );
    return ticketLines.map((line) => ({
      productCode: line.productCode,
      quantity: line.quantity,
      unitPrice: priceByCode.get(line.productCode) ?? 0,
    }));
  }

  /** Checkout / booking UI: nested seats + showtime summary (matches Spring HoldResponse). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma result with holdCheckoutInclude
  private mapHoldCheckout(hold: any) {
    const st = hold.showtime;
    const basePrice = st ? Number(st.basePrice) : 0;
    return {
      holdId: hold.id,
      id: hold.id,
      userId: hold.userId,
      showtimeId: hold.showtimeId,
      status: hold.status,
      expiresAt: hold.expiresAt.toISOString(),
      createdAt: hold.createdAt.toISOString(),
      seats: hold.holdSeats.map((hs: { seat: { id: string; rowLabel: string; number: number; type: string; price: unknown } }) => ({
        id: hs.seat.id,
        row: hs.seat.rowLabel,
        number: hs.seat.number,
        type: hs.seat.type,
        price: hs.seat.price != null ? Number(hs.seat.price) : basePrice,
      })),
      ticketLines: (hold.holdTicketLines ?? []).map(
        (line: {
          productCode: string;
          quantity: number;
          unitPrice: unknown;
          product?: {
            labelVi: string;
            labelEn: string;
            subLabelVi: string | null;
            subLabelEn: string | null;
          };
        }) => ({
          productCode: line.productCode,
          quantity: line.quantity,
          unitPrice: Number(line.unitPrice),
          labelVi: line.product?.labelVi,
          labelEn: line.product?.labelEn,
          subLabelVi: line.product?.subLabelVi,
          subLabelEn: line.product?.subLabelEn,
        }),
      ),
      showtime: st
        ? {
            movieTitle: st.movie?.title ?? undefined,
            cinemaName: st.cinema?.name ?? undefined,
            roomName: st.room?.name ?? undefined,
            startTime: st.startTime.toISOString(),
            format: mapRoomFormat(st.format),
            cinemaId: st.cinemaId,
          }
        : undefined,
    };
  }

  async release(holdId: string, userId: string) {
    const hold = await this.prisma.hold.findUnique({
      where: { id: holdId },
      include: { holdSeats: true },
    });
    if (!hold) {
      throw new NotFoundException('Hold not found');
    }
    if (hold.userId !== userId) {
      throw new ForbiddenException('You can only release your own holds');
    }
    if (hold.status !== HoldStatus.ACTIVE) {
      throw new ConflictException('Hold is no longer active');
    }

    await this.prisma.$transaction([
      this.prisma.hold.update({
        where: { id: holdId },
        data: { status: HoldStatus.RELEASED },
      }),
      this.prisma.holdSeat.deleteMany({ where: { holdId } }),
    ]);
    const seatIds = hold.holdSeats.map((hs) => hs.seatId);
    this.ws.emitSeatReleased(hold.showtimeId, seatIds);
    return { message: 'Hold released' };
  }
}
