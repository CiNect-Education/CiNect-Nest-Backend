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

  async getForecast(months?: string) {
    const numMonths = parseInt(months || '3', 10);
    const pastMonths = 6;
    const since = new Date();
    since.setMonth(since.getMonth() - pastMonths);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        createdAt: { gte: since },
      },
      select: { finalAmount: true, createdAt: true },
    });

    const monthlyRevenue: Record<string, number> = {};
    for (const b of bookings) {
      const key = `${b.createdAt.getFullYear()}-${String(b.createdAt.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue[key] =
        (monthlyRevenue[key] || 0) + Number(b.finalAmount ?? 0);
    }

    const values = Object.values(monthlyRevenue);
    const avgGrowth =
      values.length > 1
        ? values
            .slice(1)
            .reduce((s, v, i) => s + (v - values[i]) / values[i], 0) /
          (values.length - 1)
        : 0;

    const lastRevenue = values[values.length - 1] || 0;
    const forecast = [];
    for (let i = 1; i <= numMonths; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      forecast.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        predictedRevenue: Math.round(
          lastRevenue * Math.pow(1 + avgGrowth, i),
        ),
      });
    }

    return {
      historical: monthlyRevenue,
      forecast,
      averageGrowthRate: avgGrowth,
    };
  }

  async getCustomerSegments() {
    const [totalUsers, activeCustomers, tiers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { bookings: { some: { status: 'CONFIRMED' } } },
      }),
      this.prisma.membership.groupBy({
        by: ['tierId'],
        _count: true,
      }),
    ]);

    const tierDetails = await this.prisma.membershipTier.findMany();
    const byTier = tiers.map((t) => {
      const tier = tierDetails.find((td) => td.id === t.tierId);
      return {
        tier: tier?.name || 'Unknown',
        count: t._count,
        percentage:
          totalUsers > 0
            ? ((t._count / totalUsers) * 100).toFixed(1)
            : '0',
      };
    });

    return { totalUsers, activeCustomers, byTier };
  }
}
