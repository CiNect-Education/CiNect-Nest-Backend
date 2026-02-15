import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HoldStatus } from '@prisma/client';
import { mapRoomFormat } from '../common/helpers/format.helper';

@Injectable()
export class ShowtimesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { movieId?: string; cinemaId?: string; date?: string }) {
    const where: {
      isActive?: boolean;
      movieId?: string;
      cinemaId?: string;
      startTime?: { gte: Date; lte: Date };
    } = { isActive: true };

    if (filters.movieId) where.movieId = filters.movieId;
    if (filters.cinemaId) where.cinemaId = filters.cinemaId;

    if (filters.date) {
      const d = new Date(filters.date);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      where.startTime = { gte: start, lte: end };
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

    const seatMap = showtime.room.seats.map((seat) => ({
      ...seat,
      status: bookedSet.has(seat.id)
        ? 'BOOKED'
        : heldSet.has(seat.id)
          ? 'HELD'
          : seat.status,
    }));

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
