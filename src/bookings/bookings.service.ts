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
  NotificationType,
  PaymentStatus,
  RefundMethod,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { bookingApiInclude, mapBookingToApi } from './booking-api.mapper';
import {
  evaluateRefundPolicy,
  generateStoreCreditCode,
  type RefundEligibility,
} from './booking-refund.policy';
import { RequestRefundDto } from './dto/request-refund.dto';
import { formatRefundReason } from './dto/refund-reason.enum';
import { NotificationsService } from '../notifications/notifications.service';
import type { Booking, Promotion } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly config: ConfigService,
    private readonly wsGateway: WebsocketGateway,
    private readonly notifications: NotificationsService,
  ) {}

  private assertPayableBooking(booking: Pick<Booking, 'status' | 'expiresAt'>) {
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Booking is not pending payment');
    }
    if (booking.expiresAt && booking.expiresAt < new Date()) {
      throw new BadRequestException('Booking session has expired');
    }
  }

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
          expiresAt: hold.expiresAt,
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

    this.wsGateway.emitSeatBooked(
      hold.showtimeId,
      hold.holdSeats.map((hs) => hs.seatId),
    );

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

    const showtime = await this.prisma.showtime.findUnique({
      where: { id: booking.showtimeId },
      include: { movie: true },
    });
    if (showtime?.movie) {
      await this.notifications.create(userId, {
        type: NotificationType.BOOKING,
        title: 'Booking confirmed',
        message: `Your tickets for "${showtime.movie.title}" are ready.`,
        link: `/tickets/${id}`,
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

    const paid = await this.prisma.payment.findFirst({
      where: { bookingId: id, status: PaymentStatus.PAID },
    });
    if (paid) {
      throw new BadRequestException(
        'Paid bookings must be refunded instead of cancelled',
      );
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
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      throw new BadRequestException('Promotion code is required');
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId, status: 'PENDING' },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found or not pending');
    }
    this.assertPayableBooking(booking);

    if (
      booking.promotionCode &&
      booking.promotionCode.toUpperCase() === normalizedCode.toUpperCase()
    ) {
      throw new BadRequestException('Promotion already applied to this booking');
    }

    const promotion = await this.prisma.promotion.findFirst({
      where: {
        code: normalizedCode,
        status: 'ACTIVE',
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
    });
    if (!promotion) {
      throw new NotFoundException('Promotion not found or expired');
    }

    if (promotion.usageLimit && promotion.usageCount >= promotion.usageLimit) {
      throw new BadRequestException('Promotion usage limit reached');
    }

    if (
      promotion.minPurchase &&
      booking.totalAmount.toNumber() < promotion.minPurchase.toNumber()
    ) {
      throw new BadRequestException(
        'Booking total does not meet minimum purchase requirement',
      );
    }

    const totalAmount = booking.totalAmount.toNumber();
    const newPromoDiscount = this.calculatePromotionDiscount(
      totalAmount,
      promotion,
    );

    let existingPromoDiscount = 0;
    let previousPromotionId: string | null = null;
    if (booking.promotionCode) {
      const existingPromo = await this.prisma.promotion.findFirst({
        where: { code: booking.promotionCode },
      });
      if (existingPromo) {
        existingPromoDiscount = this.calculatePromotionDiscount(
          totalAmount,
          existingPromo,
        );
        previousPromotionId = existingPromo.id;
      }
    }

    const newDiscount =
      booking.discountAmount.toNumber() - existingPromoDiscount + newPromoDiscount;
    const newFinal = totalAmount - newDiscount;

    await this.prisma.$transaction(async (tx) => {
      if (previousPromotionId) {
        await tx.promotion.updateMany({
          where: { id: previousPromotionId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }

      await tx.promotion.update({
        where: { id: promotion.id },
        data: { usageCount: { increment: 1 } },
      });

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          promotionCode: promotion.code,
          discountAmount: newDiscount,
          finalAmount: Math.max(0, newFinal),
        },
      });
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
    this.assertPayableBooking(booking);

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
    this.assertPayableBooking(booking);

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

  private calculatePromotionDiscount(
    totalAmount: number,
    promotion: Pick<Promotion, 'discountType' | 'discountValue' | 'maxDiscount'>,
  ): number {
    let discount = 0;
    if (promotion.discountType === 'PERCENTAGE') {
      discount = totalAmount * (promotion.discountValue.toNumber() / 100);
      if (promotion.maxDiscount && discount > promotion.maxDiscount.toNumber()) {
        discount = promotion.maxDiscount.toNumber();
      }
    } else {
      discount = promotion.discountValue.toNumber();
    }
    return discount;
  }

  private getRefundConfig() {
    return {
      deadlineHours: parseInt(
        this.config.get('REFUND_DEADLINE_HOURS') ?? '2',
        10,
      ),
      monthlyLimit: parseInt(
        this.config.get('REFUND_MONTHLY_LIMIT') ?? '10',
        10,
      ),
    };
  }

  private async countMonthlyRefunds(userId: string): Promise<number> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.prisma.bookingRefund.count({
      where: {
        userId,
        createdAt: { gte: monthStart },
      },
    });
  }

  private async loadBookingForRefund(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payments: true,
        bookingRefund: true,
        showtime: { select: { startTime: true } },
      },
    });
  }

  async getRefundEligibility(
    bookingId: string,
    userId: string,
  ): Promise<RefundEligibility> {
    const booking = await this.loadBookingForRefund(bookingId);
    if (!booking) {
      const { deadlineHours } = this.getRefundConfig();
      return evaluateRefundPolicy(null, userId, {
        deadlineHours,
        monthlyLimit: 0,
        monthlyCount: 0,
      });
    }

    const { deadlineHours, monthlyLimit } = this.getRefundConfig();
    const monthlyCount = await this.countMonthlyRefunds(userId);

    return evaluateRefundPolicy(booking, userId, {
      deadlineHours,
      monthlyLimit,
      monthlyCount,
    });
  }

  async findRefunds(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.bookingRefund.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          booking: {
            include: {
              showtime: { include: { movie: true, cinema: true, room: true } },
            },
          },
        },
      }),
      this.prisma.bookingRefund.count({ where: { userId } }),
    ]);

    const data = items.map((refund) => ({
      id: refund.id,
      bookingId: refund.bookingId,
      amount: Number(refund.amount),
      refundMethod: refund.refundMethod,
      storeCreditCode: refund.storeCreditCode ?? undefined,
      pointsRestored: refund.pointsRestored,
      giftCardRestored: refund.giftCardRestored ?? undefined,
      reason: refund.reason ?? undefined,
      createdAt: refund.createdAt.toISOString(),
      movieTitle: refund.booking.showtime.movie.title,
      cinemaName: refund.booking.showtime.cinema.name,
      showtime: refund.booking.showtime.startTime.toISOString(),
    }));

    const meta = new PageMeta(page, limit, total);
    return { data, meta };
  }

  async requestRefund(bookingId: string, userId: string, dto: RequestRefundDto) {
    const booking = await this.loadBookingForRefund(bookingId);
    const { deadlineHours, monthlyLimit } = this.getRefundConfig();
    const monthlyCount = await this.countMonthlyRefunds(userId);

    const eligibility = evaluateRefundPolicy(booking, userId, {
      deadlineHours,
      monthlyLimit,
      monthlyCount,
    });

    if (!eligibility.eligible) {
      throw new BadRequestException({
        message: `Refund not allowed: ${eligibility.reasonCode}`,
        ...eligibility,
      });
    }

    const method = dto.method ?? RefundMethod.STORE_CREDIT;
    return this.executeRefund(booking!, {
      userId,
      method,
      reason: formatRefundReason(dto.reasonCode, dto.reasonDetail),
    });
  }

  async adminRefund(bookingId: string, reason?: string) {
    const booking = await this.loadBookingForRefund(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const { deadlineHours, monthlyLimit } = this.getRefundConfig();
    const monthlyCount = await this.countMonthlyRefunds(booking.userId);

    const eligibility = evaluateRefundPolicy(booking, booking.userId, {
      deadlineHours,
      monthlyLimit,
      monthlyCount,
      bypassDeadline: true,
      bypassMonthlyLimit: true,
      bypassOwner: true,
    });

    if (!eligibility.eligible) {
      throw new BadRequestException({
        message: `Refund not allowed: ${eligibility.reasonCode}`,
        ...eligibility,
      });
    }

    return this.executeRefund(booking, {
      userId: booking.userId,
      method: RefundMethod.ORIGINAL_PAYMENT,
      reason: reason ?? 'Admin refund',
      initiatedByAdmin: true,
    });
  }

  private async executeRefund(
    booking: NonNullable<Awaited<ReturnType<typeof this.loadBookingForRefund>>>,
    options: {
      userId: string;
      method: RefundMethod;
      reason?: string;
      initiatedByAdmin?: boolean;
    },
  ) {
    const paidPayment = booking.payments.find((p) => p.status === PaymentStatus.PAID);
    if (!paidPayment) {
      throw new BadRequestException('No paid payment to refund');
    }

    const refundAmount = paidPayment.amount.toNumber();
    const bookingItems = await this.prisma.bookingItem.findMany({
      where: { bookingId: booking.id },
      select: { seatId: true },
    });

    const pointsPerBooking = parseInt(
      this.config.get('POINTS_PER_BOOKING') ?? '10',
      10,
    );

    let storeCreditCode: string | null = null;

    const refundRecord = await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED },
      });

      for (const payment of booking.payments) {
        if (payment.status === PaymentStatus.PAID) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.REFUNDED },
          });
        }
      }

      const spentEntries = await tx.pointsHistory.findMany({
        where: { bookingId: booking.id, type: 'SPENT' },
      });
      const pointsToRestore = spentEntries.reduce((sum, e) => sum + e.points, 0);

      if (pointsToRestore > 0) {
        const membership = await tx.membership.findUnique({
          where: { userId: options.userId },
        });
        if (membership) {
          const newBalance = membership.currentPoints + pointsToRestore;
          await tx.membership.update({
            where: { id: membership.id },
            data: { currentPoints: newBalance },
          });
          await tx.pointsHistory.create({
            data: {
              userId: options.userId,
              type: 'ADJUSTED',
              points: pointsToRestore,
              balance: newBalance,
              description: 'Points restored from ticket refund',
              bookingId: booking.id,
            },
          });
        }
      } else if (booking.pointsUsed > 0) {
        const membership = await tx.membership.findUnique({
          where: { userId: options.userId },
        });
        if (membership) {
          const newBalance = membership.currentPoints + booking.pointsUsed;
          await tx.membership.update({
            where: { id: membership.id },
            data: { currentPoints: newBalance },
          });
          await tx.pointsHistory.create({
            data: {
              userId: options.userId,
              type: 'ADJUSTED',
              points: booking.pointsUsed,
              balance: newBalance,
              description: 'Points restored from ticket refund',
              bookingId: booking.id,
            },
          });
        }
      }

      const earnedEntries = await tx.pointsHistory.findMany({
        where: { bookingId: booking.id, type: 'EARNED' },
      });
      const pointsToClawBack = earnedEntries.reduce((sum, e) => sum + e.points, 0) || pointsPerBooking;

      if (pointsToClawBack > 0) {
        const membership = await tx.membership.findUnique({
          where: { userId: options.userId },
        });
        if (membership) {
          const newBalance = Math.max(0, membership.currentPoints - pointsToClawBack);
          const newTotal = Math.max(0, membership.totalPoints - pointsToClawBack);
          await tx.membership.update({
            where: { id: membership.id },
            data: { currentPoints: newBalance, totalPoints: newTotal },
          });
          await tx.pointsHistory.create({
            data: {
              userId: options.userId,
              type: 'ADJUSTED',
              points: -pointsToClawBack,
              balance: newBalance,
              description: 'Points reversed due to ticket refund',
              bookingId: booking.id,
            },
          });
        }
      }

      let giftCardRestored: string | null = null;
      if (booking.giftCardCode) {
        const giftCard = await tx.giftCard.findFirst({
          where: { code: booking.giftCardCode },
        });
        if (giftCard && giftCard.status === 'REDEEMED') {
          await tx.giftCard.update({
            where: { id: giftCard.id },
            data: { status: 'AVAILABLE' },
          });
          giftCardRestored = booking.giftCardCode;
        }
      }

      if (options.method === RefundMethod.STORE_CREDIT && refundAmount > 0) {
        storeCreditCode = generateStoreCreditCode();
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        await tx.giftCard.create({
          data: {
            title: 'CiNect Store Credit',
            description: `Refund credit for booking ${booking.id.slice(0, 8)}`,
            value: refundAmount,
            price: refundAmount,
            code: storeCreditCode,
            status: 'AVAILABLE',
            expiresAt,
          },
        });
      }

      const restoredPoints =
        pointsToRestore > 0 ? pointsToRestore : booking.pointsUsed;

      return tx.bookingRefund.create({
        data: {
          bookingId: booking.id,
          userId: options.userId,
          amount: refundAmount,
          refundMethod: options.method,
          storeCreditCode,
          pointsRestored: restoredPoints,
          giftCardRestored,
          reason: options.reason,
        },
      });
    });

    const releasedSeatIds = bookingItems.map((bi) => bi.seatId);
    if (releasedSeatIds.length > 0) {
      this.wsGateway.emitSeatReleased(booking.showtimeId, releasedSeatIds);
    }

    await this.notifications.create(options.userId, {
      type: NotificationType.REFUND,
      title: 'Refund processed',
      message: `Your refund of ${refundAmount.toLocaleString('vi-VN')} VND has been processed.`,
      link: '/account/orders',
    });

    return {
      message: 'Booking refunded successfully',
      refund: {
        id: refundRecord.id,
        bookingId: refundRecord.bookingId,
        amount: Number(refundRecord.amount),
        refundMethod: refundRecord.refundMethod,
        storeCreditCode: refundRecord.storeCreditCode ?? undefined,
        pointsRestored: refundRecord.pointsRestored,
        giftCardRestored: refundRecord.giftCardRestored ?? undefined,
        createdAt: refundRecord.createdAt.toISOString(),
      },
    };
  }
}
