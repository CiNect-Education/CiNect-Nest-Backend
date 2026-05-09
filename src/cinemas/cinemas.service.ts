import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapRoomFormat } from '../common/helpers/format.helper';
import { ProvinceResolverService } from '../provinces/province-resolver.service';

@Injectable()
export class CinemasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provinceResolver: ProvinceResolverService,
  ) {}

  async findAll(city?: string, search?: string) {
    const provinceCode = await this.provinceResolver.resolveToNewCode(city);
    const where: Prisma.CinemaWhereInput = { isActive: true };
    if (provinceCode) {
      where.provinceNew = { code: provinceCode };
    }

    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.AND = [
        {
          OR: [
            { name: { contains: normalizedSearch, mode: 'insensitive' } },
            { slug: { contains: normalizedSearch, mode: 'insensitive' } },
            { address: { contains: normalizedSearch, mode: 'insensitive' } },
            { district: { contains: normalizedSearch, mode: 'insensitive' } },
          ],
        },
      ];
    }
    const cinemas = await this.prisma.cinema.findMany({
      where,
      include: { rooms: { where: { isActive: true }, select: { id: true } } },
      orderBy: { name: 'asc' },
    });
    return cinemas.map((c) => this.toListResponse(c));
  }

  async findBySlug(slug: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug);

    if (isUuid) {
      const byId = await this.prisma.cinema.findFirst({
        where: { id: slug, isActive: true },
        include: {
          rooms: {
            where: { isActive: true },
            orderBy: { name: 'asc' },
          },
        },
      });
      if (byId) return byId;
    }

    const cinema = await this.prisma.cinema.findFirst({
      where: { slug, isActive: true },
      include: {
        rooms: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!cinema) {
      throw new NotFoundException('Cinema not found');
    }
    return cinema;
  }

  private toListResponse(cinema: any) {
    const { rooms, isActive, ...rest } = cinema;
    return {
      ...rest,
      roomCount: rooms?.length ?? 0,
    };
  }

  async findRooms(cinemaId: string) {
    const cinema = await this.prisma.cinema.findUnique({
      where: { id: cinemaId },
    });
    if (!cinema) {
      throw new NotFoundException('Cinema not found');
    }
    const rooms = await this.prisma.room.findMany({
      where: { cinemaId, isActive: true },
      include: { seats: true },
      orderBy: { name: 'asc' },
    });
    return rooms.map(({ format, ...r }) => ({
      ...r,
      format: mapRoomFormat(format),
      cinemaName: cinema.name,
    }));
  }

  async findShowtimes(cinemaId: string, date?: string, movieId?: string) {
    const cinema = await this.prisma.cinema.findUnique({
      where: { id: cinemaId },
    });
    if (!cinema) {
      throw new NotFoundException('Cinema not found');
    }

    const where: { cinemaId: string; isActive: boolean; startTime?: { gte: Date; lte: Date } } = {
      cinemaId,
      isActive: true,
    };

    if (date) {
      const d = new Date(date);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      where.startTime = { gte: start, lte: end };
    }

    if (movieId) {
      (where as Record<string, unknown>).movieId = movieId;
    }

    const showtimes = await this.prisma.showtime.findMany({
      where,
      include: {
        movie: { select: { id: true, title: true, slug: true, posterUrl: true, duration: true } },
        room: { select: { id: true, name: true, format: true } },
        cinema: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    return showtimes.map(({ movie, room, cinema: cin, basePrice, format, ...st }) => ({
      ...st,
      basePrice: Number(basePrice),
      format: mapRoomFormat(format),
      movieTitle: movie?.title ?? null,
      moviePosterUrl: movie?.posterUrl ?? null,
      cinemaName: cin?.name ?? null,
      roomName: room?.name ?? null,
      availableSeats: null,
      totalSeats: null,
    }));
  }
}
