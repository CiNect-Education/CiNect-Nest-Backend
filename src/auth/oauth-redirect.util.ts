/** Build frontend URLs for OAuth success/failure (includes locale segment). */

export function oauthFrontendBase(frontendUrl: string, locale = 'vi'): string {
  const base = frontendUrl.replace(/\/$/, '');
  const loc = locale.replace(/^\//, '').split('/')[0] || 'vi';
  return `${base}/${loc}`;
}

export function oauthCallbackSuccessUrl(
  frontendUrl: string,
  tokens: { accessToken: string; refreshToken: string },
  locale = 'vi',
): string {
  const params = new URLSearchParams({
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
  return `${oauthFrontendBase(frontendUrl, locale)}/callback?${params.toString()}`;
}

export function oauthLoginErrorUrl(
  frontendUrl: string,
  error: string,
  locale = 'vi',
): string {
  const params = new URLSearchParams({ error });
  return `${oauthFrontendBase(frontendUrl, locale)}/login?${params.toString()}`;
}

export function isOAuthCallbackPath(url: string): boolean {
  return /\/auth\/(google|facebook|github)\/callback/i.test(url);
}
