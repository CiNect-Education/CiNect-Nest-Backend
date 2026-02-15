import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod, PaymentStatus, BookingStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async initiate(bookingId: string, userId: string, method: PaymentMethod) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new ForbiddenException('Booking is not pending payment');
    }

    const existing = await this.prisma.payment.findFirst({
      where: { bookingId, status: PaymentStatus.PAID },
    });
    if (existing) {
      throw new ForbiddenException('Booking is already paid');
    }

    const transactionId = `TXN-${uuidv4().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
    const paymentUrl = `https://payment-sim.cinect.local/pay/${transactionId}?amount=${booking.finalAmount}&returnUrl=/bookings/${bookingId}`;

    const payment = await this.prisma.payment.create({
      data: {
        bookingId,
        method,
        amount: booking.finalAmount,
        status: PaymentStatus.PENDING,
        transactionId,
        paymentUrl,
      },
    });

    return {
      paymentId: payment.id,
      transactionId,
      paymentUrl,
      amount: Number(booking.finalAmount),
    };
  }

  async callback(transactionId: string, success: boolean) {
    const payment = await this.prisma.payment.findFirst({
      where: { transactionId },
      include: { booking: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const newStatus = success ? PaymentStatus.PAID : PaymentStatus.FAILED;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          ...(success ? { paidAt: new Date() } : { errorReason: 'Payment failed' }),
        },
      });

      if (success) {
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: BookingStatus.CONFIRMED },
        });
      }
    });

    return {
      success,
      bookingId: payment.bookingId,
      status: newStatus,
    };
  }

  async getStatus(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId },
      include: { booking: true },
    });
    if (!payment || payment.booking.userId !== userId) {
      throw new NotFoundException('Payment not found');
    }

    return {
      id: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      method: payment.method,
      transactionId: payment.transactionId,
      paidAt: payment.paidAt,
    };
  }
}
