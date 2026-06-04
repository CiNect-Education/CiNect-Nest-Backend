import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeImageUrl } from '../../prisma/lib/normalize-image-url';

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
    const rows = await this.prisma.banner.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((b) => ({
      ...b,
      imageUrl: normalizeImageUrl(b.imageUrl) ?? b.imageUrl,
    }));
  }
}
