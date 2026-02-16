import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(limit?: number) {
    const now = new Date();
    return this.prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { endDate: 'asc' },
      ...(limit ? { take: limit } : {}),
    });
  }

  async findTrending() {
    const now = new Date();
    return this.prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        isTrending: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });
  }

  async findEligible(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });

    // Filter in JS for complex conditions
    return promotions.filter((p) => {
      if (p.minPurchase && booking.totalAmount.toNumber() < p.minPurchase.toNumber()) {
        return false;
      }
      if (p.usageLimit && p.usageCount >= p.usageLimit) {
        return false;
      }
      return true;
    });
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
