import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Aligns with Spring AdminController.resolveAnalyticsWindow. */
function parseAnalyticsWindow(
  range?: string,
  fromDate?: string,
  toDate?: string,
): { from: Date; to: Date } {
  const now = new Date();
  if (fromDate && toDate) {
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const toDay = new Date(`${toDate}T00:00:00.000Z`);
    const toExclusive = new Date(toDay.getTime() + 24 * 60 * 60 * 1000);
    return { from, to: toExclusive };
  }
  if (range && range !== 'custom') {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now };
  }
  return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now };
}

function lastInclusiveDateKey(toExclusive: Date): string {
  return new Date(toExclusive.getTime() - 1).toISOString().slice(0, 10);
}

function eachUtcDayInclusive(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  let d = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${endKey}T00:00:00.000Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Daily revenue for charts — matches Spring {@code GET /admin/analytics/revenue}. */
  async getRevenueChart(range?: string, from?: string, to?: string) {
    const w = parseAnalyticsWindow(range, from, to);
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: w.from, lt: w.to },
      },
      select: { createdAt: true, finalAmount: true },
    });
    const byDate = new Map<string, number>();
    for (const b of bookings) {
      const k = b.createdAt.toISOString().slice(0, 10);
      byDate.set(k, (byDate.get(k) ?? 0) + Number(b.finalAmount ?? 0));
    }
    const startKey = w.from.toISOString().slice(0, 10);
    const endKey = lastInclusiveDateKey(w.to);
    const days = eachUtcDayInclusive(startKey, endKey);
    return days.map((date) => ({ date, revenue: byDate.get(date) ?? 0 }));
  }

  /** Next 7 days after the UTC calendar date of {@code w.to} — matches Spring getForecastSeries. */
  async getForecastSeries(range?: string, from?: string, to?: string) {
    const w = parseAnalyticsWindow(range, from, to);
    const daily = await this.getRevenueChart(range, from, to);
    if (daily.length === 0) return [];
    const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0);
    const avgDailyRev = daily.length > 0 ? totalRevenue / daily.length : 0;
    const baseKey = w.to.toISOString().slice(0, 10);
    const base = new Date(`${baseKey}T00:00:00.000Z`);
    const out: { date: string; revenue: number }[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
      out.push({ date: d.toISOString().slice(0, 10), revenue: avgDailyRev });
    }
    return out;
  }

  /** Occupancy grid — matches Spring {@code getOccupancyByCinemaDate}. */
  async getOccupancyByCinemaDate(range?: string, from?: string, to?: string) {
    const w = parseAnalyticsWindow(range, from, to);
    const showtimes = await this.prisma.showtime.findMany({
      where: {
        isActive: true,
        startTime: { gte: w.from, lt: w.to },
      },
      select: {
        id: true,
        startTime: true,
        cinema: { select: { id: true, name: true } },
        room: { select: { totalSeats: true } },
      },
    });
    if (showtimes.length === 0) return [];

    const showtimeIds = showtimes.map((s) => s.id);
    const booked = await this.prisma.bookingItem.groupBy({
      by: ['showtimeId'],
      where: {
        showtimeId: { in: showtimeIds },
        booking: { status: { in: ['CONFIRMED', 'COMPLETED'] } },
      },
      _count: true,
    });
    const bookedByShowtime = new Map<string, number>();
    for (const row of booked) {
      bookedByShowtime.set(row.showtimeId, row._count);
    }

    type Agg = { booked: number; capacity: number; name: string };
    const map = new Map<string, Agg>();
    for (const st of showtimes) {
      const dateStr = st.startTime.toISOString().slice(0, 10);
      const key = `${st.cinema.id}|${dateStr}`;
      const cap = st.room.totalSeats ?? 0;
      const b = bookedByShowtime.get(st.id) ?? 0;
      const prev = map.get(key) ?? { booked: 0, capacity: 0, name: st.cinema.name };
      prev.booked += b;
      prev.capacity += cap;
      prev.name = st.cinema.name;
      map.set(key, prev);
    }

    const rows: {
      cinemaId: string;
      cinemaName: string;
      date: string;
      occupancy: number;
    }[] = [];
    const keys = [...map.keys()].sort();
    for (const key of keys) {
      const agg = map.get(key)!;
      const [cinemaId, date] = key.split('|');
      const occ = agg.capacity > 0 ? agg.booked / agg.capacity : 0;
      rows.push({
        cinemaId,
        cinemaName: agg.name,
        date,
        occupancy: occ,
      });
    }
    return rows;
  }

  /** Pie chart — matches Spring {@code getCustomerSegmentsChart}. */
  async getCustomerSegmentsChart() {
    const [totalUsers, tiers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.membership.groupBy({
        by: ['tierId'],
        _count: true,
      }),
    ]);
    const tierDetails = await this.prisma.membershipTier.findMany();
    return tiers.map((t) => {
      const tier = tierDetails.find((td) => td.id === t.tierId);
      const name = tier?.name ?? 'Unknown';
      const pct =
        totalUsers > 0 ? Math.round((t._count / totalUsers) * 10000) / 100 : 0;
      return {
        segment: name,
        count: t._count,
        percentage: pct,
      };
    });
  }

  /** 24 hours — CONFIRMED only, hour from booking.createdAt UTC (Spring getPeakHours). */
  async getPeakHoursSeries(range?: string, from?: string, to?: string) {
    const w = parseAnalyticsWindow(range, from, to);
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        createdAt: { gte: w.from, lt: w.to },
      },
      select: { createdAt: true },
    });
    const hourCounts = new Array(24).fill(0) as number[];
    for (const b of bookings) {
      const h = b.createdAt.getUTCHours();
      hourCounts[h]++;
    }
    return hourCounts.map((bookings, hour) => ({ hour, bookings }));
  }

  // ─── Legacy / extra endpoints (optional tooling) ─────────────────

  async getTopMovies(limit = 10) {
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = new Date();
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
      .map(([, v]) => v)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    return { topMovies: top };
  }
}
