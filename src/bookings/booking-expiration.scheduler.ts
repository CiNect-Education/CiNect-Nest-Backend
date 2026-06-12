import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class BookingExpirationScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: WebsocketGateway,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async expirePendingBookings() {
    const now = new Date();
    const expired = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.PENDING,
        expiresAt: { lt: now },
      },
      include: { bookingItems: { select: { seatId: true } } },
    });

    for (const booking of expired) {
      const seatIds = booking.bookingItems.map((bi) => bi.seatId);
      await this.prisma.$transaction([
        this.prisma.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.CANCELLED },
        }),
        this.prisma.payment.updateMany({
          where: { bookingId: booking.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED, errorReason: 'Payment session expired' },
        }),
      ]);
      if (seatIds.length > 0) {
        this.ws.emitSeatReleased(booking.showtimeId, seatIds);
      }
    }
  }
}
