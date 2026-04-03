import { mapRoomFormat } from '../common/helpers/format.helper';
import type { Prisma } from '@prisma/client';

/** Relations needed to build the frontend Booking shape */
export const bookingApiInclude = {
  bookingItems: true,
  bookingSnacks: true,
  payments: true,
  showtime: { include: { movie: true, room: true, cinema: true } },
} satisfies Prisma.BookingInclude;

export type BookingApiPayload = Prisma.BookingGetPayload<{ include: typeof bookingApiInclude }>;

/**
 * Maps a Prisma booking row to the flat JSON contract expected by cinect-frontend (bookingSchema).
 */
export function mapBookingToApi(b: BookingApiPayload) {
  const st = b.showtime;
  const paid =
    b.payments?.find((p) => p.status === 'PAID') ?? b.payments?.[0] ?? null;

  return {
    id: b.id,
    userId: b.userId,
    showtimeId: b.showtimeId,
    seats: (b.bookingItems ?? []).map((item) => ({
      seatId: item.seatId,
      row: item.rowLabel,
      number: item.seatNumber,
      type: item.seatType,
      price: Number(item.price),
    })),
    snacks: (b.bookingSnacks ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      quantity: s.quantity,
      unitPrice: Number(s.unitPrice),
      totalPrice: Number(s.totalPrice),
      imageUrl: undefined as string | undefined,
    })),
    totalAmount: Number(b.totalAmount),
    discountAmount: Number(b.discountAmount),
    finalAmount: Number(b.finalAmount),
    status: b.status,
    payment: paid
      ? {
          id: paid.id,
          bookingId: paid.bookingId,
          method: paid.method,
          status: paid.status,
          amount: Number(paid.amount),
          transactionId: paid.transactionId ?? undefined,
          paidAt: paid.paidAt?.toISOString(),
          createdAt: paid.createdAt.toISOString(),
        }
      : undefined,
    promotionCode: b.promotionCode ?? undefined,
    pointsUsed: b.pointsUsed ?? undefined,
    giftCardCode: b.giftCardCode ?? undefined,
    movieTitle: st?.movie?.title ?? '',
    moviePosterUrl: st?.movie?.posterUrl ?? undefined,
    cinemaName: st?.cinema?.name ?? '',
    roomName: st?.room?.name ?? '',
    showtime: st?.startTime
      ? st.startTime.toISOString()
      : b.createdAt.toISOString(),
    format: st ? mapRoomFormat(st.format) : '2D',
    qrCode: b.qrCode ?? undefined,
    expiresAt: b.expiresAt?.toISOString(),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}
