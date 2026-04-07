import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HoldStatus } from '@prisma/client';
import { mapRoomFormat } from '../common/helpers/format.helper';
import { ProvinceResolverService } from '../provinces/province-resolver.service';

@Injectable()
export class ShowtimesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provinceResolver: ProvinceResolverService,
  ) {}

  async findAll(filters: {
    movieId?: string;
    cinemaId?: string;
    city?: string;
    date?: string;
    format?: string;
  }) {
    const where: {
      isActive?: boolean;
      movieId?: string;
      cinemaId?: string;
      cinema?: { provinceNew?: { code: string } };
      startTime?: { gte: Date; lt: Date };
    } = { isActive: true };

    if (filters.movieId) where.movieId = filters.movieId;
    if (filters.cinemaId) {
      where.cinemaId = filters.cinemaId;
    } else {
      const provinceCode = await this.provinceResolver.resolveToNewCode(filters.city);
      if (provinceCode) {
        where.cinema = { provinceNew: { code: provinceCode } };
      }
    }
    const format = filters.format?.trim().toUpperCase();
    if (format) {
      (where as Record<string, unknown>).format = format.startsWith('_') ? format : `_${format}`;
      if (format === 'IMAX' || format === 'DOLBY') {
        (where as Record<string, unknown>).format = format;
      }
    }

    if (filters.date) {
      const parts = filters.date.split('-').map((x) => parseInt(x, 10));
      if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
        const [y, m, day] = parts;
        const dayStart = new Date(y, m - 1, day, 0, 0, 0, 0);
        const dayEndExclusive = new Date(y, m - 1, day + 1, 0, 0, 0, 0);
        const now = new Date();
        // Hide already-started showtimes when querying today's date.
        const start = dayStart < now ? now : dayStart;
        where.startTime = { gte: start, lt: dayEndExclusive };
      }
    } else {
      const now = new Date();
      const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      where.startTime = { gte: now, lt: next7Days };
    }

    const showtimes = await this.prisma.showtime.findMany({
      where,
      include: {
        movie: { select: { id: true, title: true, slug: true, posterUrl: true, duration: true } },
        room: { select: { id: true, name: true, format: true } },
        cinema: { select: { id: true, name: true, slug: true, address: true, city: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    // Flatten nested objects to match frontend expected format
    return showtimes.map(({ movie, room, cinema, basePrice, format, ...st }) => ({
      ...st,
      basePrice: Number(basePrice),
      format: mapRoomFormat(format),
      movieTitle: movie?.title ?? null,
      moviePosterUrl: movie?.posterUrl ?? null,
      cinemaName: cinema?.name ?? null,
      roomName: room?.name ?? null,
      availableSeats: null,
      totalSeats: null,
    }));
  }

  async findOne(id: string) {
    const showtime = await this.prisma.showtime.findFirst({
      where: { id, isActive: true },
      include: {
        movie: true,
        room: { include: { cinema: true } },
        cinema: true,
      },
    });
    if (!showtime) {
      throw new NotFoundException('Showtime not found');
    }
    const { movie, room, cinema, basePrice, format, ...st } = showtime;
    return {
      ...st,
      basePrice: Number(basePrice),
      format: mapRoomFormat(format),
      movieTitle: movie?.title ?? null,
      moviePosterUrl: movie?.posterUrl ?? null,
      cinemaName: cinema?.name ?? null,
      roomName: room?.name ?? null,
      availableSeats: null,
      totalSeats: null,
      movie,
      room,
      cinema,
    };
  }

  async findSeats(showtimeId: string) {
    const showtime = await this.prisma.showtime.findFirst({
      where: { id: showtimeId, isActive: true },
      include: { room: { include: { seats: true } } },
    });
    if (!showtime) {
      throw new NotFoundException('Showtime not found');
    }

    const seatIds = showtime.room.seats.map((s) => s.id);

    const [heldSeatIds, bookedSeatIds] = await Promise.all([
      this.prisma.holdSeat.findMany({
        where: {
          showtimeId,
          hold: { status: HoldStatus.ACTIVE, expiresAt: { gt: new Date() } },
        },
        select: { seatId: true },
      }).then((r) => r.map((x) => x.seatId)),

      this.prisma.bookingItem.findMany({
        where: {
          showtimeId,
          booking: { status: { not: 'CANCELLED' } },
        },
        select: { seatId: true },
      }).then((r) => r.map((x) => x.seatId)),
    ]);

    const heldSet = new Set(heldSeatIds);
    const bookedSet = new Set(bookedSeatIds);

    const seatMap = showtime.room.seats.map((seat) => {
      const status = bookedSet.has(seat.id)
        ? 'BOOKED'
        : heldSet.has(seat.id)
          ? 'HELD'
          : seat.status;
      return {
        id: seat.id,
        roomId: seat.roomId,
        row: seat.rowLabel,
        rowLabel: seat.rowLabel,
        number: seat.number,
        type: seat.type,
        status,
        pairId: seat.pairId,
        isAisle: seat.isAisle,
        price: seat.price != null ? Number(seat.price) : null,
      };
    });

    return {
      showtime: {
        id: showtime.id,
        startTime: showtime.startTime,
        endTime: showtime.endTime,
        basePrice: showtime.basePrice,
        format: showtime.format,
      },
      room: {
        id: showtime.room.id,
        name: showtime.room.name,
        format: showtime.room.format,
      },
      seats: seatMap,
    };
  }
}
