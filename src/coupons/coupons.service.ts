import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserCoupons(userId: string) {
    return this.prisma.coupon.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      include: { promotion: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async validate(code: string, subtotal: number, userId: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: { code, status: 'ACTIVE' },
    });
    if (!coupon) {
      throw new NotFoundException('Coupon not found or expired');
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Coupon has expired');
    }
    if (coupon.userId && coupon.userId !== userId) {
      throw new BadRequestException('This coupon is not valid for your account');
    }
    if (coupon.minPurchase && subtotal < Number(coupon.minPurchase)) {
      throw new BadRequestException(`Minimum purchase of ${coupon.minPurchase} required`);
    }

    let discount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discount = subtotal * (Number(coupon.discountValue) / 100);
    } else {
      discount = Number(coupon.discountValue);
    }

    if (coupon.maxDiscount && discount > Number(coupon.maxDiscount)) {
      discount = Number(coupon.maxDiscount);
    }

    return {
      valid: true,
      discount,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
    };
  }

  async redeem(code: string, userId: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: { code, userId, status: 'ACTIVE' },
    });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    await this.prisma.coupon.update({
      where: { id: coupon.id },
      data: { status: 'USED', usedAt: new Date() },
    });
    return { message: 'Coupon redeemed successfully' };
  }
}
