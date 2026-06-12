import { BookingStatus, PaymentStatus } from '@prisma/client';

export type RefundReasonCode =
  | 'ELIGIBLE'
  | 'BOOKING_NOT_FOUND'
  | 'NOT_OWNER'
  | 'INVALID_STATUS'
  | 'NOT_PAID'
  | 'ALREADY_REFUNDED'
  | 'DEADLINE_PASSED'
  | 'MONTHLY_LIMIT_REACHED'
  | 'SHOWTIME_STARTED';

export type RefundEligibility = {
  eligible: boolean;
  reasonCode: RefundReasonCode;
  deadlineHours: number;
  deadlineAt?: string;
  showtimeAt?: string;
  refundAmount?: number;
  monthlyRefundsUsed?: number;
  monthlyRefundsLimit?: number;
  allowedMethods: Array<'STORE_CREDIT' | 'ORIGINAL_PAYMENT'>;
};

type BookingForPolicy = {
  id: string;
  userId: string;
  status: BookingStatus;
  finalAmount: { toNumber(): number };
  showtime: { startTime: Date };
  payments: Array<{ status: PaymentStatus; amount: { toNumber(): number } }>;
  bookingRefund?: { id: string } | null;
};

export function evaluateRefundPolicy(
  booking: BookingForPolicy | null,
  userId: string,
  options: {
    deadlineHours: number;
    monthlyLimit: number;
    monthlyCount: number;
    bypassDeadline?: boolean;
    bypassMonthlyLimit?: boolean;
    bypassOwner?: boolean;
  },
): RefundEligibility {
  const allowedMethods: RefundEligibility['allowedMethods'] = [
    'STORE_CREDIT',
    'ORIGINAL_PAYMENT',
  ];

  if (!booking) {
    return {
      eligible: false,
      reasonCode: 'BOOKING_NOT_FOUND',
      deadlineHours: options.deadlineHours,
      allowedMethods,
    };
  }

  if (booking.userId !== userId && !options.bypassOwner) {
    return {
      eligible: false,
      reasonCode: 'NOT_OWNER',
      deadlineHours: options.deadlineHours,
      allowedMethods,
    };
  }

  if (booking.bookingRefund) {
    return {
      eligible: false,
      reasonCode: 'ALREADY_REFUNDED',
      deadlineHours: options.deadlineHours,
      allowedMethods,
    };
  }

  if (booking.status !== BookingStatus.CONFIRMED) {
    return {
      eligible: false,
      reasonCode: 'INVALID_STATUS',
      deadlineHours: options.deadlineHours,
      allowedMethods,
    };
  }

  const paidPayment = booking.payments.find((p) => p.status === PaymentStatus.PAID);
  if (!paidPayment) {
    const refunded = booking.payments.some((p) => p.status === PaymentStatus.REFUNDED);
    return {
      eligible: false,
      reasonCode: refunded ? 'ALREADY_REFUNDED' : 'NOT_PAID',
      deadlineHours: options.deadlineHours,
      allowedMethods,
    };
  }

  const showtimeAt = booking.showtime.startTime;
  const now = new Date();

  if (showtimeAt <= now) {
    return {
      eligible: false,
      reasonCode: 'SHOWTIME_STARTED',
      deadlineHours: options.deadlineHours,
      showtimeAt: showtimeAt.toISOString(),
      allowedMethods,
    };
  }

  const deadlineAt = new Date(
    showtimeAt.getTime() - options.deadlineHours * 60 * 60 * 1000,
  );

  if (!options.bypassDeadline && now > deadlineAt) {
    return {
      eligible: false,
      reasonCode: 'DEADLINE_PASSED',
      deadlineHours: options.deadlineHours,
      deadlineAt: deadlineAt.toISOString(),
      showtimeAt: showtimeAt.toISOString(),
      allowedMethods,
    };
  }

  if (!options.bypassMonthlyLimit && options.monthlyCount >= options.monthlyLimit) {
    return {
      eligible: false,
      reasonCode: 'MONTHLY_LIMIT_REACHED',
      deadlineHours: options.deadlineHours,
      deadlineAt: deadlineAt.toISOString(),
      showtimeAt: showtimeAt.toISOString(),
      refundAmount: paidPayment.amount.toNumber(),
      monthlyRefundsUsed: options.monthlyCount,
      monthlyRefundsLimit: options.monthlyLimit,
      allowedMethods,
    };
  }

  return {
    eligible: true,
    reasonCode: 'ELIGIBLE',
    deadlineHours: options.deadlineHours,
    deadlineAt: deadlineAt.toISOString(),
    showtimeAt: showtimeAt.toISOString(),
    refundAmount: paidPayment.amount.toNumber(),
    monthlyRefundsUsed: options.monthlyCount,
    monthlyRefundsLimit: options.monthlyLimit,
    allowedMethods,
  };
}

export function generateStoreCreditCode(): string {
  const segment = Math.random().toString(36).slice(2, 8).toUpperCase();
  const segment2 = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SC-${segment}${segment2}`;
}
