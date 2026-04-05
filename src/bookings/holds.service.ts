import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { mapRoomFormat } from '../common/helpers/format.helper';
import { HoldStatus } from '@prisma/client';

const holdCheckoutInclude = {
  holdSeats: { include: { seat: true } },
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
  ) {}

  getTtlMinutes(): number {
    return parseInt(this.config.get('HOLD_TTL_MINUTES') ?? '10', 10);
  }

  async create(showtimeId: string, userId: string, seatIds: string[]) {
    const showtime = await this.prisma.showtime.findFirst({
      where: { id: showtimeId, isActive: true },
      include: { room: { include: { seats: true } } },
    });
    if (!showtime) {
      throw new NotFoundException('Showtime not found');
    }

    const roomSeatIds = new Set(showtime.room.seats.map((s) => s.id));
    for (const sid of seatIds) {
      if (!roomSeatIds.has(sid)) {
        throw new ConflictException(`Seat ${sid} does not belong to this showtime's room`);
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
