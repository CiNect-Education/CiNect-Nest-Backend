import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../common/services/pricing.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PageMeta } from '../common/dto/page-meta.dto';
import {
  BookingStatus,
  HoldStatus,
  PaymentStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { bookingApiInclude, mapBookingToApi } from './booking-api.mapper';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly config: ConfigService,
    private readonly wsGateway: WebsocketGateway,
  ) {}

  async create(userId: string, dto: CreateBookingDto) {
    const hold = await this.prisma.hold.findUnique({
      where: { id: dto.holdId },
      include: {
        holdSeats: { include: { seat: true } },
        showtime: { include: { movie: true, room: true, cinema: true } },
      },
    });

    if (!hold || hold.userId !== userId) {
      throw new NotFoundException('Hold not found');
    }
    if (hold.status !== HoldStatus.ACTIVE) {
      throw new BadRequestException('Hold is no longer active');
    }
    if (hold.expiresAt < new Date()) {
      throw new BadRequestException('Hold has expired');
    }
    if (hold.showtimeId !== dto.showtimeId) {
      throw new BadRequestException('Hold does not match showtime');
    }

    const pointsPerBooking = parseInt(
      this.config.get('POINTS_PER_BOOKING') ?? '10',
      10,
    );

    const booking = await this.prisma.$transaction(async (tx) => {
      const seatIds = hold.holdSeats.map((hs) => hs.seatId);

      const existing = await tx.bookingItem.findMany({
        where: {
          showtimeId: hold.showtimeId,
          seatId: { in: seatIds },
          booking: { status: { not: 'CANCELLED' } },
        },
      });
      if (existing.length > 0) {
        throw new ConflictException(
          'One or more seats have been booked by another user',
        );
      }

      let totalAmount = new Decimal(0);

      for (const hs of hold.holdSeats) {
        const price = await this.pricing.getSeatPrice({
          showtimeId: hold.showtimeId,
          seatId: hs.seatId,
          cinemaId: hold.showtime.cinemaId,
          format: hold.showtime.format,
          seatType: hs.seat.type,
          startTime: hold.showtime.startTime,
        });
        totalAmount = totalAmount.add(price);
      }

      let discountAmount = new Decimal(0);
      let promotionCode: string | null = null;
      let pointsUsed = 0;
      let giftCardCode: string | null = dto.giftCardCode ?? null;
      let appliedGiftCardId: string | null = null;

      if (dto.promotionCode) {
        const promos = await tx.promotion.findMany({
          where: {
            code: dto.promotionCode,
            status: 'ACTIVE',
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
          },
        });
        const promo = promos.find(
          (p) => !p.usageLimit || p.usageCount < p.usageLimit,
        );
        if (promo) {
          const minPurchase = promo.minPurchase ? Number(promo.minPurchase) : 0;
          if (Number(totalAmount) >= minPurchase) {
            let discount = 0;
            if (promo.discountType === 'PERCENTAGE') {
              discount =
                (Number(totalAmount) * Number(promo.discountValue)) / 100;
              if (promo.maxDiscount && discount > Number(promo.maxDiscount)) {
                discount = Number(promo.maxDiscount);
              }
            } else {
              discount = Number(promo.discountValue);
            }
            discountAmount = discountAmount.add(discount);
            promotionCode = promo.code;
          }
        }
      }

      const membership = await tx.membership.findUnique({
        where: { userId },
        include: { tier: true },
      });

      if (
        membership?.tier.discountPercent &&
        Number(membership.tier.discountPercent) > 0
      ) {
        const tierDiscount =
          ((Number(totalAmount) - Number(discountAmount)) *
            Number(membership.tier.discountPercent)) /
          100;
        discountAmount = discountAmount.add(tierDiscount);
      }

      const maxPoints = membership?.currentPoints ?? 0;
      const pointsToUse = Math.min(
        dto.pointsToUse ?? 0,
        maxPoints,
        Math.floor((Number(totalAmount) * 0.1) / 10),
      );
      if (pointsToUse > 0) {
        const pointsValue = pointsToUse * 10;
        discountAmount = discountAmount.add(pointsValue);
        pointsUsed = pointsToUse;
      }

      if (dto.giftCardCode) {
        const giftCard = await tx.giftCard.findFirst({
          where: { code: dto.giftCardCode, status: 'AVAILABLE' },
        });
        if (!giftCard) {
          throw new BadRequestException(
            'Gift card not found or already used',
          );
        }
        if (giftCard.expiresAt && giftCard.expiresAt < new Date()) {
          throw new BadRequestException('Gift card has expired');
        }
        const remainingAmount = Number(totalAmount) - Number(discountAmount);
        const giftValue = Number(giftCard.value);
        const appliedValue = Math.min(giftValue, Math.max(0, remainingAmount));
        discountAmount = discountAmount.add(appliedValue);
        giftCardCode = dto.giftCardCode;
        appliedGiftCardId = giftCard.id;
      }

      let snackTotal = new Decimal(0);
      const snackItems: {
        snackId: string;
        name: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
      }[] = [];

      if (dto.snacks && dto.snacks.length > 0) {
        for (const s of dto.snacks) {
          const snack = await tx.snack.findUnique({ where: { id: s.snackId } });
          if (snack && snack.isActive) {
            const up = Number(snack.price);
            const total = up * s.quantity;
            snackTotal = snackTotal.add(total);
            snackItems.push({
              snackId: snack.id,
              name: snack.name,
              quantity: s.quantity,
              unitPrice: up,
              totalPrice: total,
            });
          }
        }
      }

      totalAmount = totalAmount.add(snackTotal);
      const finalAmount = Math.max(
        0,
        Number(totalAmount) - Number(discountAmount),
      );

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const b = await tx.booking.create({
        data: {
          userId,
          showtimeId: hold.showtimeId,
          holdId: hold.id,
          totalAmount,
          discountAmount,
          finalAmount,
          status: BookingStatus.PENDING,
          promotionCode,
          pointsUsed,
          giftCardCode,
          expiresAt,
        },
      });

      await tx.hold.update({
        where: { id: hold.id },
        data: { status: HoldStatus.CONVERTED },
      });

      if (appliedGiftCardId) {
        await tx.giftCard.update({
          where: { id: appliedGiftCardId },
          data: { status: 'REDEEMED' },
        });
      }

      for (const hs of hold.holdSeats) {
        const seatPrice = await this.pricing.getSeatPrice({
          showtimeId: hold.showtimeId,
          seatId: hs.seatId,
          cinemaId: hold.showtime.cinemaId,
          format: hold.showtime.format,
          seatType: hs.seat.type,
          startTime: hold.showtime.startTime,
        });
        await tx.bookingItem.create({
          data: {
            bookingId: b.id,
            seatId: hs.seatId,
            showtimeId: hold.showtimeId,
            rowLabel: hs.seat.rowLabel,
            seatNumber: hs.seat.number,
            seatType: hs.seat.type,
            price: seatPrice,
          },
        });
      }

      for (const si of snackItems) {
        await tx.bookingSnack.create({
          data: {
            bookingId: b.id,
            snackId: si.snackId,
            name: si.name,
            quantity: si.quantity,
            unitPrice: si.unitPrice,
            totalPrice: si.totalPrice,
          },
        });
      }

      return b;
    });

    const created = await this.prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: bookingApiInclude,
    });
    return mapBookingToApi(created);
  }

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: { userId },
        skip,
        take: limit,
        include: bookingApiInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.booking.count({ where: { userId } }),
    ]);
    const meta = new PageMeta(page, limit, total);
    return { data: items.map(mapBookingToApi), meta };
  }

  async findOne(id: string, userId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, userId },
      include: bookingApiInclude,
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return mapBookingToApi(booking);
  }

  async confirm(id: string, userId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, userId },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Booking cannot be confirmed');
    }

    const paid = await this.prisma.payment.findFirst({
      where: { bookingId: id, status: PaymentStatus.PAID },
    });
    if (!paid) {
      throw new BadRequestException(
        'Payment must be completed before confirmation',
      );
    }

    const confirmedBooking = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CONFIRMED },
      include: { bookingItems: { select: { seatId: true } } },
    });

    // Emit seat booked event via WebSocket
    const bookedSeatIds = confirmedBooking.bookingItems.map((bi) => bi.seatId);
    if (bookedSeatIds.length > 0) {
      this.wsGateway.emitSeatBooked(booking.showtimeId, bookedSeatIds);
    }

    const pointsToAdd = parseInt(
      this.config.get('POINTS_PER_BOOKING') ?? '10',
      10,
    );
    const membership = await this.prisma.membership.findUnique({
      where: { userId },
    });
    if (membership) {
      const newPoints = membership.currentPoints + pointsToAdd;
      const newTotal = membership.totalPoints + pointsToAdd;
      await this.prisma.membership.update({
        where: { id: membership.id },
        data: { currentPoints: newPoints, totalPoints: newTotal },
      });
      await this.prisma.pointsHistory.create({
        data: {
          userId,
          type: 'EARNED',
          points: pointsToAdd,
          balance: newPoints,
          description: 'Points from booking',
          bookingId: id,
        },
      });
    }

    return this.findOne(id, userId);
  }

  async cancel(id: string, userId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, userId },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.CONFIRMED
    ) {
      throw new BadRequestException('Booking cannot be cancelled');
    }

    // Get seat IDs before cancelling for WebSocket notification
    const bookingItems = await this.prisma.bookingItem.findMany({
      where: { bookingId: id },
      select: { seatId: true },
    });

    await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: { status: BookingStatus.CANCELLED },
      }),
      this.prisma.payment.updateMany({
        where: { bookingId: id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      }),
    ]);

    // Emit seat released event via WebSocket
    const releasedSeatIds = bookingItems.map((bi) => bi.seatId);
    if (releasedSeatIds.length > 0) {
      this.wsGateway.emitSeatReleased(booking.showtimeId, releasedSeatIds);
    }

    return { message: 'Booking cancelled' };
  }

  async applyPromo(bookingId: string, userId: string, code: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId, status: 'PENDING' },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found or not pending');
    }

    const promotion = await this.prisma.promotion.findFirst({
      where: {
        code,
        status: 'ACTIVE',
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
    });
    if (!promotion) {
      throw new NotFoundException('Promotion not found or expired');
    }

    if (promotion.minPurchase && booking.totalAmount.toNumber() < promotion.minPurchase.toNumber()) {
      throw new BadRequestException('Booking total does not meet minimum purchase requirement');
    }

    let discount = 0;
    if (promotion.discountType === 'PERCENTAGE') {
      discount = booking.totalAmount.toNumber() * (promotion.discountValue.toNumber() / 100);
    } else {
      discount = promotion.discountValue.toNumber();
    }
    if (promotion.maxDiscount && discount > promotion.maxDiscount.toNumber()) {
      discount = promotion.maxDiscount.toNumber();
    }

    const newDiscount = booking.discountAmount.toNumber() + discount;
    const newFinal = booking.totalAmount.toNumber() - newDiscount;

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        promotionCode: code,
        discountAmount: newDiscount,
        finalAmount: Math.max(0, newFinal),
      },
    });

    await this.prisma.promotion.update({
      where: { id: promotion.id },
      data: { usageCount: { increment: 1 } },
    });

    return this.findOne(bookingId, userId);
  }

  async applyPoints(bookingId: string, userId: string, points: number) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId, status: 'PENDING' },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found or not pending');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { userId },
    });
    if (!membership || membership.currentPoints < points) {
      throw new BadRequestException('Insufficient points');
    }

    // Redemption rate: 1 point = 10 currency units.
    const pointsValue = points * 10;
    const newDiscount = booking.discountAmount.toNumber() + pointsValue;
    const newFinal = booking.totalAmount.toNumber() - newDiscount;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({
        where: { userId },
        data: { currentPoints: { decrement: points } },
      });

      await tx.pointsHistory.create({
        data: {
          userId,
          type: 'SPENT',
          points: -points,
          balance: membership.currentPoints - points,
          description: `Redeemed ${points} points for booking`,
          bookingId,
        },
      });

      return tx.booking.update({
        where: { id: bookingId },
        data: {
          pointsUsed: (booking.pointsUsed || 0) + points,
          discountAmount: newDiscount,
          finalAmount: Math.max(0, newFinal),
        },
      });
    });

    return this.findOne(bookingId, userId);
  }

  async applyGiftCard(bookingId: string, userId: string, code: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId, status: 'PENDING' },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found or not pending');
    }

    const giftCard = await this.prisma.giftCard.findFirst({
      where: { code, status: 'AVAILABLE' },
    });
    if (!giftCard) {
      throw new NotFoundException('Gift card not found or already used');
    }
    if (giftCard.expiresAt && giftCard.expiresAt < new Date()) {
      throw new BadRequestException('Gift card has expired');
    }

    const giftValue = giftCard.value.toNumber();
    const remainingAmount = booking.finalAmount.toNumber();
    const appliedValue = Math.min(giftValue, remainingAmount);

    const newDiscount = booking.discountAmount.toNumber() + appliedValue;
    const newFinal = booking.totalAmount.toNumber() - newDiscount;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.giftCard.update({
        where: { id: giftCard.id },
        data: { status: 'REDEEMED' },
      });

      return tx.booking.update({
        where: { id: bookingId },
        data: {
          giftCardCode: code,
          discountAmount: newDiscount,
          finalAmount: Math.max(0, newFinal),
        },
      });
    });

    return this.findOne(bookingId, userId);
  }
}
