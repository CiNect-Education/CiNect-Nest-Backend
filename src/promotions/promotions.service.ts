import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const now = new Date();
    const promos = await this.prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { endDate: 'asc' },
    });
    return promos.map(this.toResponse);
  }

  async findActive(limit = 8) {
    const now = new Date();
    const promos = await this.prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { endDate: 'asc' },
      take: limit,
    });
    return promos.map(this.toResponse);
  }

  async findTrending() {
    const now = new Date();
    const promos = await this.prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        isTrending: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });
    return promos.map(this.toResponse);
  }

  private toResponse(p: any) {
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      code: p.code,
      discountType: p.discountType,
      discountValue: p.discountValue ? Number(p.discountValue) : 0,
      minPurchase: p.minPurchase ? Number(p.minPurchase) : null,
      maxDiscount: p.maxDiscount ? Number(p.maxDiscount) : null,
      usageLimit: p.usageLimit,
      usageCount: p.usageCount,
      startDate: p.startDate,
      endDate: p.endDate,
      imageUrl: p.imageUrl,
      conditions: p.conditions,
      status: p.status,
      isTrending: p.isTrending,
      createdAt: p.createdAt,
    };
  }

  async validate(code: string, amount?: number) {
    const promo = await this.prisma.promotion.findFirst({
      where: {
        code,
        status: 'ACTIVE',
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
    });
    if (!promo) {
      throw new NotFoundException('Invalid or expired promotion code');
    }
    if (promo.usageLimit && promo.usageCount >= promo.usageLimit) {
      throw new NotFoundException('Promotion usage limit reached');
    }
    const minPurchase = promo.minPurchase ? Number(promo.minPurchase) : 0;
    if (amount !== undefined && amount < minPurchase) {
      return {
        valid: false,
        message: `Minimum purchase of ${minPurchase} required`,
      };
    }
    return {
      valid: true,
      promotion: {
        id: promo.id,
        title: promo.title,
        code: promo.code,
        discountType: promo.discountType,
        discountValue: Number(promo.discountValue),
        minPurchase: promo.minPurchase ? Number(promo.minPurchase) : null,
        maxDiscount: promo.maxDiscount ? Number(promo.maxDiscount) : null,
      },
    };
  }
}
