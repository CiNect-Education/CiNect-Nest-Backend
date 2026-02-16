import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.giftCard.findMany({
      where: { status: 'AVAILABLE' },
    });
  }

  async findOne(id: string) {
    const card = await this.prisma.giftCard.findUnique({
      where: { id },
    });
    if (!card) {
      throw new NotFoundException('Gift card not found');
    }
    return card;
  }

  async purchase(
    id: string,
    userId: string,
    recipientEmail?: string,
    message?: string,
  ) {
    const card = await this.prisma.giftCard.findUnique({
      where: { id },
    });
    if (!card) {
      throw new NotFoundException('Gift card not found');
    }
    if (card.status !== 'AVAILABLE') {
      throw new ConflictException('Gift card is not available');
    }

    const uniqueCode =
      'GC-' + randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
    const purchasedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.giftCard.update({
        where: { id },
        data: { code: uniqueCode, status: 'SOLD_OUT' },
      });
      await tx.giftTransaction.create({
        data: {
          giftCardId: id,
          buyerId: userId,
          recipientEmail: recipientEmail ?? null,
          message: message ?? null,
          purchasedAt,
        },
      });
    });

    return this.prisma.giftCard.findUnique({
      where: { id },
    });
  }
}
