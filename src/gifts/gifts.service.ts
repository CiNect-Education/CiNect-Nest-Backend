import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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

  async purchase(id: string, userId: string) {
    const card = await this.prisma.giftCard.findUnique({
      where: { id },
    });
    if (!card) {
      throw new NotFoundException('Gift card not found');
    }
    if (card.status !== 'AVAILABLE') {
      throw new ConflictException('Gift card is not available');
    }

    const tx = await this.prisma.giftTransaction.create({
      data: {
        giftCardId: id,
        buyerId: userId,
      },
    });

    return {
      message: 'Gift card purchase initiated',
      transactionId: tx.id,
    };
  }
}
