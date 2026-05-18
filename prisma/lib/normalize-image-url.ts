/** Encode Amazon CDN URLs so `@` does not break clients or proxies. */
export function normalizeImageUrl(url: string | null | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("data:")) return trimmed;
  return trimmed.replace(/@/g, "%40");
}
