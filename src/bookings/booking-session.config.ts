import { ConfigService } from '@nestjs/config';

/** Seat hold + checkout + payment share one session window (CGV/Lotte-style). */
export function getBookingSessionMinutes(config: ConfigService): number {
  const holdTtl = config.get<string>('HOLD_TTL_MINUTES');
  if (holdTtl != null && holdTtl !== '') {
    return parseInt(holdTtl, 10);
  }
  const legacyPayment = config.get<string>('PAYMENT_TIMEOUT_MINUTES');
  if (legacyPayment != null && legacyPayment !== '') {
    return parseInt(legacyPayment, 10);
  }
  return 10;
}

export function bookingSessionExpiresAt(config: ConfigService, from = new Date()): Date {
  const minutes = getBookingSessionMinutes(config);
  return new Date(from.getTime() + minutes * 60 * 1000);
}
