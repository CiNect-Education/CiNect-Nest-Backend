const REVIEW_UPLOAD_PREFIX = '/uploads/reviews/';

export function reviewImagePublicPath(filename: string): string {
  const safe = filename.replace(/^\/+/, '').split('/').pop() ?? filename;
  return `${REVIEW_UPLOAD_PREFIX}${safe}`;
}

/** Normalize stored or uploaded review image URLs to same-origin paths. */
export function normalizeReviewImageSrc(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith(REVIEW_UPLOAD_PREFIX)) {
    return trimmed;
  }

  try {
    const pathname = new URL(trimmed).pathname;
    if (pathname.startsWith(REVIEW_UPLOAD_PREFIX)) {
      return pathname;
    }
  } catch {
    // not a full URL
  }

  if (trimmed.startsWith('uploads/reviews/')) {
    return `/${trimmed}`;
  }

  return trimmed;
}

export function normalizeReviewImageUrls(value: unknown): string[] {
  if (value == null) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        return normalizeReviewImageUrls(JSON.parse(trimmed));
      } catch {
        return [normalizeReviewImageSrc(trimmed)];
      }
    }
    return [normalizeReviewImageSrc(trimmed)];
  }

  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => normalizeReviewImageSrc(item));
}

export function sanitizeReviewImageUrls(urls?: string[], max = 3): string[] {
  if (!urls?.length) return [];
  const normalized = normalizeReviewImageUrls(urls);
  return [...new Set(normalized)].slice(0, max);
}
