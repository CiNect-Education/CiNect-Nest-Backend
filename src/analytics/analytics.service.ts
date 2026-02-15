import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRevenue(startDate?: Date, endDate?: Date) {
    const start = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ?? new Date();

    const result = await this.prisma.booking.aggregate({
      where: {
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: start, lte: end },
      },
      _sum: { finalAmount: true },
      _count: true,
    });

    return {
      totalRevenue: Number(result._sum.finalAmount ?? 0),
      bookingCount: result._count,
      period: { start, end },
    };
  }

  async getOccupancy(showtimeId?: string, cinemaId?: string) {
    const where: Record<string, unknown> = {};
    if (showtimeId) where.showtimeId = showtimeId;
    if (cinemaId) where.showtime = { cinemaId };

    const confirmedStatuses: BookingStatus[] = ['CONFIRMED', 'COMPLETED'];
    const [totalSeats, bookedSeats] = await Promise.all([
      this.prisma.bookingItem.count({ where: { ...where, booking: { status: { not: 'CANCELLED' } } } }),
      this.prisma.bookingItem.count({ where: { ...where, booking: { status: { in: confirmedStatuses } } } }),
    ]);

    const showtimes = await this.prisma.showtime.findMany({
      where: cinemaId ? { cinemaId } : {},
      include: { room: true },
    });

    let capacity = 0;
    for (const st of showtimes) {
      capacity += st.room.totalSeats || 0;
    }

    const occupancyRate = capacity > 0 ? (bookedSeats / capacity) * 100 : 0;
    return { occupancyRate, bookedSeats, capacity };
  }

  async getPeakHours(cinemaId?: string, days = 30) {
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: start },
        ...(cinemaId ? { showtime: { cinemaId } } : {}),
      },
      include: { showtime: true },
    });

    const hourCounts: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourCounts[h] = 0;
    for (const b of bookings) {
      const h = new Date(b.showtime.startTime).getHours();
      hourCounts[h]++;
    }

    const peak = Object.entries(hourCounts)
      .map(([h, c]) => ({ hour: parseInt(h, 10), count: c }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { peakHours: peak };
  }

  async getTopMovies(limit = 10, startDate?: Date, endDate?: Date) {
    const start = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ?? new Date();

    const items = await this.prisma.bookingItem.groupBy({
      by: ['showtimeId'],
      where: {
        booking: {
          status: { in: ['CONFIRMED', 'COMPLETED'] },
          createdAt: { gte: start, lte: end },
        },
      },
      _count: true,
    });

    const showtimeIds = items.map((i) => i.showtimeId);
    const showtimes = await this.prisma.showtime.findMany({
      where: { id: { in: showtimeIds } },
      include: { movie: true },
    });

    const movieCounts: Record<string, { count: number; movie: unknown }> = {};
    for (const st of showtimes) {
      const item = items.find((i) => i.showtimeId === st.id);
      const count = item?._count ?? 0;
      const mid = st.movieId;
      if (!movieCounts[mid]) {
        movieCounts[mid] = { count: 0, movie: st.movie };
      }
      movieCounts[mid].count += count;
    }

    const top = Object.entries(movieCounts)
      .map(([_, v]) => v)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return { topMovies: top };
  }
}
