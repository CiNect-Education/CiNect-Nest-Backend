import { MovieStatus } from '@prisma/client';

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Resolve public listing status from catalog intent + release date.
 * - Future release → COMING_SOON (even if catalog says NOW_SHOWING)
 * - Past release still marked COMING_SOON in catalog → NOW_SHOWING
 * - Otherwise keep catalog status (demo catalog keeps blockbusters as NOW_SHOWING)
 */
export function resolveListingStatus(
  releaseDate: Date,
  catalogStatus: MovieStatus,
  now = new Date(),
): MovieStatus {
  const today = startOfUtcDay(now);
  const release = startOfUtcDay(releaseDate);

  if (release > today) {
    return MovieStatus.COMING_SOON;
  }

  if (catalogStatus === MovieStatus.COMING_SOON) {
    return MovieStatus.NOW_SHOWING;
  }

  return catalogStatus;
}
