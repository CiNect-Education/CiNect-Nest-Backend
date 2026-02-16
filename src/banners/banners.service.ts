import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(position?: string) {
    const now = new Date();
    const where: {
      isActive: boolean;
      OR?: Array<Record<string, unknown>>;
      AND?: Array<Record<string, unknown>>;
      position?: string;
    } = {
      isActive: true,
      AND: [
        {
          OR: [{ startDate: null }, { startDate: { lte: now } }],
        },
        {
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      ],
    };
    if (position) {
      where.position = position;
    }
    return this.prisma.banner.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }
}
