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
