import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketGateway } from './websocket.gateway';
import { HoldStatus } from '@prisma/client';

@Injectable()
export class HoldExpirationScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: WebsocketGateway,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async expireHolds() {
    const now = new Date();
    const expired = await this.prisma.hold.findMany({
      where: {
        status: HoldStatus.ACTIVE,
        expiresAt: { lt: now },
      },
      include: { holdSeats: true },
    });

    for (const hold of expired) {
      const seatIds = hold.holdSeats.map((hs) => hs.seatId);
      await this.prisma.$transaction([
        this.prisma.hold.update({
          where: { id: hold.id },
          data: { status: HoldStatus.EXPIRED },
        }),
        this.prisma.holdSeat.deleteMany({ where: { holdId: hold.id } }),
      ]);
      this.ws.emitHoldExpired(hold.showtimeId, seatIds);
    }
  }
}
