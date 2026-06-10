import { randomBytes } from 'node:crypto';

const PROFANITY = [
  'fuck',
  'shit',
  'damn',
  'bitch',
  'asshole',
  'địt',
  'đụ',
  'lồn',
  'cặc',
  'đéo',
];

export function generateReferralCode(): string {
  return `CIN${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function generateInviteToken(): string {
  return randomBytes(16).toString('hex');
}

export function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase();
  return PROFANITY.some((w) => lower.includes(w));
}

export function computeWeightedMovieRating(
  reviews: { rating: number; isVerified: boolean }[],
): { rating: number; count: number } {
  if (reviews.length === 0) {
    return { rating: 0, count: 0 };
  }
  let weightedSum = 0;
  let totalWeight = 0;
  for (const r of reviews) {
    const w = r.isVerified ? 2 : 1;
    weightedSum += r.rating * w;
    totalWeight += w;
  }
  return {
    rating: totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0,
    count: reviews.length,
  };
}
