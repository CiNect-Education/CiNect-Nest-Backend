export enum RefundReasonCode {
  SCHEDULE_CONFLICT = 'SCHEDULE_CONFLICT',
  WRONG_BOOKING = 'WRONG_BOOKING',
  DUPLICATE = 'DUPLICATE',
  FOUND_CHEAPER = 'FOUND_CHEAPER',
  OTHER = 'OTHER',
}

export function formatRefundReason(
  reasonCode: RefundReasonCode,
  reasonDetail?: string,
): string {
  if (reasonCode === RefundReasonCode.OTHER) {
    const detail = reasonDetail?.trim();
    return detail ? `OTHER: ${detail}` : 'OTHER';
  }
  return reasonCode;
}
