import { join } from 'path';

/**
 * Resolve `cinect-nest-backend/uploads` regardless of `process.cwd()`
 * (e.g. when the API is started from the monorepo root).
 */
export function resolveUploadsRoot(): string {
  return join(__dirname, '..', '..', 'uploads');
}
