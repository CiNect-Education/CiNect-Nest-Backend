import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CinemasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(city?: string) {
    const where = city ? { city, isActive: true } : { isActive: true };
    return this.prisma.cinema.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    const cinema = await this.prisma.cinema.findFirst({
      where: { slug, isActive: true },
    });
    if (!cinema) {
      throw new NotFoundException('Cinema not found');
    }
    return cinema;
  }

  async findRooms(cinemaId: string) {
    const cinema = await this.prisma.cinema.findUnique({
      where: { id: cinemaId },
    });
    if (!cinema) {
      throw new NotFoundException('Cinema not found');
    }
    return this.prisma.room.findMany({
      where: { cinemaId, isActive: true },
      include: { seats: true },
      orderBy: { name: 'asc' },
    });
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

    return this.prisma.showtime.findMany({
      where,
      include: {
        movie: { select: { id: true, title: true, slug: true, posterUrl: true, duration: true } },
        room: { select: { id: true, name: true, format: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  }
}
