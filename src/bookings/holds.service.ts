import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { HoldStatus } from '@prisma/client';

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

    // Clean up expired ACTIVE holds for these seats to avoid unique constraint errors
    // when hold seats are kept but the hold has expired.
    const expired = await this.prisma.hold.findMany({
      where: {
        showtimeId,
        status: HoldStatus.ACTIVE,
        expiresAt: { lte: now },
        holdSeats: { some: { seatId: { in: seatIds } } },
      },
      include: { holdSeats: true },
    });
    if (expired.length > 0) {
      const expiredHoldIds = expired.map((h) => h.id);
      const expiredSeatIds = [...new Set(expired.flatMap((h) => h.holdSeats.map((hs) => hs.seatId)))];
      await this.prisma.$transaction([
        this.prisma.hold.updateMany({
          where: { id: { in: expiredHoldIds } },
          data: { status: HoldStatus.EXPIRED },
        }),
        this.prisma.holdSeat.deleteMany({ where: { holdId: { in: expiredHoldIds } } }),
      ]);
      // Notify clients that seats are free again
      this.ws.emitHoldExpired(showtimeId, expiredSeatIds);
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
      include: { holdSeats: { include: { seat: true } } },
    });
    this.ws.emitSeatHeld(showtimeId, seatIds);
    return result;
  }

  async findOne(holdId: string, userId: string) {
    const hold = await this.prisma.hold.findUnique({
      where: { id: holdId },
      include: { holdSeats: { include: { seat: true } } },
    });
    if (!hold) {
      throw new NotFoundException('Hold not found');
    }
    if (hold.userId !== userId) {
      throw new ForbiddenException('You can only view your own holds');
    }
    return hold;
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

    await this.prisma.hold.update({
      where: { id: holdId },
      data: { status: HoldStatus.RELEASED },
    });
    const seatIds = hold.holdSeats.map((hs) => hs.seatId);
    this.ws.emitSeatReleased(hold.showtimeId, seatIds);
    return { message: 'Hold released' };
  }
}
