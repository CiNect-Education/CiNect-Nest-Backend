import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageMeta } from '../common/dto/page-meta.dto';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

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
    const membership = await this.prisma.membership.findUnique({
      where: { userId },
      include: { tier: true },
    });
    if (membership) return membership;

    // Auto-provision a default membership for new users.
    const defaultTier = await this.prisma.membershipTier.findFirst({
      orderBy: { level: 'asc' },
    });
    if (!defaultTier) {
      throw new NotFoundException('Membership tier not found');
    }

    return this.prisma.membership.create({
      data: {
        userId,
        tierId: defaultTier.id,
        currentPoints: 0,
        totalPoints: 0,
      },
      include: { tier: true },
    });
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
}
