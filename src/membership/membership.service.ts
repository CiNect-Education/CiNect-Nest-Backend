import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageMeta } from '../common/dto/page-meta.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly dailyCheckinBasePoints = 10;
  private readonly dailyCheckinMaxPoints = 30;

  private getStartOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getNextDayStart(date = new Date()) {
    const d = this.getStartOfDay(date);
    d.setDate(d.getDate() + 1);
    return d;
  }

  private calculateDailyReward(streak: number) {
    const extra = Math.max(0, streak - 1) * 2;
    return Math.min(this.dailyCheckinBasePoints + extra, this.dailyCheckinMaxPoints);
  }

  private async getOrCreateMembership(
    userId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? this.prisma;
    const found = await client.membership.findUnique({
      where: { userId },
      include: { tier: true },
    });
    if (found) return found;

    const defaultTier = await client.membershipTier.findFirst({
      orderBy: { level: 'asc' },
    });
    if (!defaultTier) {
      throw new NotFoundException('Membership tier not found');
    }
    return client.membership.create({
      data: {
        userId,
        tierId: defaultTier.id,
        currentPoints: 0,
        totalPoints: 0,
        dailyCheckinStreak: 0,
      },
      include: { tier: true },
    });
  }

  async getTiers() {
    return this.prisma.membershipTier.findMany({
      orderBy: { level: 'asc' },
    });
  }

  async getEvents() {
    return this.prisma.showtime.findMany({
      where: {
        memberExclusive: true,
        isActive: true,
        startTime: { gte: new Date() },
      },
      include: {
        movie: { select: { id: true, title: true, slug: true, posterUrl: true, duration: true } },
        room: { select: { id: true, name: true, format: true } },
        cinema: { select: { id: true, name: true, slug: true, address: true, city: true } },
      },
      orderBy: { startTime: 'asc' },
      take: 20,
    });
  }

  async getProfile(userId: string) {
    return this.getOrCreateMembership(userId);
  }

  async getPointsHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.pointsHistory.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.pointsHistory.count({ where: { userId } }),
    ]);
    const meta = new PageMeta(page, limit, total);
    return { data: items, meta };
  }

  async getDailyCheckinStatus(userId: string) {
    const membership = await this.getOrCreateMembership(userId);
    const now = new Date();
    const todayStart = this.getStartOfDay(now);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const last = membership.lastDailyCheckinAt;
    const eligibleToday = !last || last < todayStart;
    const continuing = !!last && last >= yesterdayStart && last < todayStart;
    const nextStreak = eligibleToday ? (continuing ? membership.dailyCheckinStreak + 1 : 1) : membership.dailyCheckinStreak;
    const todayClaim = await this.prisma.pointsHistory.findFirst({
      where: {
        userId,
        type: 'EARNED',
        description: { startsWith: 'Daily check-in reward' },
        createdAt: { gte: todayStart },
      },
      orderBy: { createdAt: 'desc' },
    });
    const rewardPoints = eligibleToday
      ? this.calculateDailyReward(nextStreak)
      : Math.max(0, todayClaim?.points ?? 0);

    return {
      eligibleToday,
      rewardPoints,
      nextRewardPoints: this.calculateDailyReward(nextStreak),
      streak: membership.dailyCheckinStreak ?? 0,
      nextStreak,
      currentPoints: membership.currentPoints,
      totalPoints: membership.totalPoints,
      lastCheckinAt: membership.lastDailyCheckinAt,
      nextEligibleAt: eligibleToday ? now : this.getNextDayStart(now),
    };
  }

  async claimDailyCheckin(userId: string) {
    const now = new Date();
    const todayStart = this.getStartOfDay(now);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    return this.prisma.$transaction(async (tx) => {
      const membership = await this.getOrCreateMembership(userId, tx);
      const last = membership.lastDailyCheckinAt;
      if (last && last >= todayStart) {
        throw new BadRequestException('Daily check-in already claimed today');
      }

      const nextStreak = last && last >= yesterdayStart ? membership.dailyCheckinStreak + 1 : 1;
      const rewardPoints = this.calculateDailyReward(nextStreak);

      const updated = await tx.membership.updateMany({
        where: {
          id: membership.id,
          OR: [{ lastDailyCheckinAt: null }, { lastDailyCheckinAt: { lt: todayStart } }],
        },
        data: {
          lastDailyCheckinAt: now,
          dailyCheckinStreak: nextStreak,
          currentPoints: { increment: rewardPoints },
          totalPoints: { increment: rewardPoints },
        },
      });

      if (updated.count !== 1) {
        throw new BadRequestException('Daily check-in already claimed today');
      }

      const refreshed = await tx.membership.findUniqueOrThrow({
        where: { id: membership.id },
      });

      await tx.pointsHistory.create({
        data: {
          userId,
          type: 'EARNED',
          points: rewardPoints,
          balance: refreshed.currentPoints,
          description: `Daily check-in reward (Day ${nextStreak})`,
        },
      });

      return {
        success: true,
        claimedAt: now,
        rewardPoints,
        streak: nextStreak,
        currentPoints: refreshed.currentPoints,
        totalPoints: refreshed.totalPoints,
      };
    });
  }
}
