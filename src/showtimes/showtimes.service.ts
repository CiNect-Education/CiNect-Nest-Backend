import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HoldStatus } from '@prisma/client';
import { mapRoomFormat } from '../common/helpers/format.helper';
import { ProvinceResolverService } from '../provinces/province-resolver.service';
import { PricingService } from '../common/services/pricing.service';

@Injectable()
export class ShowtimesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provinceResolver: ProvinceResolverService,
    private readonly pricing: PricingService,
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
        movie: {
          select: {
            id: true,
            title: true,
            slug: true,
            posterUrl: true,
            duration: true,
            ageRating: true,
            language: true,
            subtitles: true,
            movieGenres: { select: { genre: { select: { name: true } } } },
          },
        },
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
      movieSlug: movie?.slug ?? null,
      movieDuration: movie?.duration ?? null,
      movieAgeRating: movie?.ageRating ?? null,
      movieLanguage: movie?.language ?? null,
      movieSubtitles: movie?.subtitles ?? null,
      movieGenres: movie?.movieGenres?.map((mg) => mg.genre.name) ?? [],
      cinemaName: cinema?.name ?? null,
      cinemaSlug: cinema?.slug ?? null,
      cinemaAddress: cinema?.address ?? null,
      roomName: room?.name ?? null,
      roomFormat: room?.format ? mapRoomFormat(room.format) : null,
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
    const now = new Date();
    await this.cleanupStaleHoldSeats(showtimeId, now);

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
          hold: { status: HoldStatus.ACTIVE, expiresAt: { gt: now } },
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

    const seatPrices = await this.pricing.getSeatPricesForShowtime(
      {
        id: showtime.id,
        cinemaId: showtime.cinemaId,
        format: showtime.format,
        startTime: showtime.startTime,
        basePrice: Number(showtime.basePrice),
      },
      showtime.room.seats,
    );

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
        gridCol: seat.gridCol,
        type: seat.type,
        status,
        pairId: seat.pairId,
        isAisle: seat.isAisle,
        price: seatPrices.get(seat.id) ?? Number(showtime.basePrice),
      };
    });

    const layoutTemplate = showtime.room.layoutTemplate ?? 'GRID';
    const aisleAfterCol =
      layoutTemplate === 'CINESTAR_STANDARD' ? 6 : null;

    return {
      showtime: {
        id: showtime.id,
        startTime: showtime.startTime,
        endTime: showtime.endTime,
        basePrice: Number(showtime.basePrice),
        format: mapRoomFormat(showtime.format),
      },
      room: {
        id: showtime.room.id,
        name: showtime.room.name,
        format: mapRoomFormat(showtime.room.format),
        layoutTemplate,
        aisleAfterCol,
      },
      seats: seatMap,
    };
  }

  /** Remove expired / inactive hold rows so seat availability matches the grid. */
  private async cleanupStaleHoldSeats(showtimeId: string, now: Date) {
    const stale = await this.prisma.hold.findMany({
      where: {
        showtimeId,
        holdSeats: { some: {} },
        OR: [{ status: { not: HoldStatus.ACTIVE } }, { expiresAt: { lte: now } }],
      },
      select: { id: true, status: true, expiresAt: true },
    });
    if (stale.length === 0) return;

    const staleHoldIds = stale.map((h) => h.id);
    await this.prisma.$transaction([
      this.prisma.hold.updateMany({
        where: {
          id: { in: staleHoldIds },
          status: HoldStatus.ACTIVE,
          expiresAt: { lte: now },
        },
        data: { status: HoldStatus.EXPIRED },
      }),
      this.prisma.holdSeat.deleteMany({ where: { holdId: { in: staleHoldIds } } }),
    ]);
  }
}
