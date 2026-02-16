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
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    return membership;
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
