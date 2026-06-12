import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { resolveUploadsRoot } from './uploads-root';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const AVATAR_UPLOAD_DIR = join(resolveUploadsRoot(), 'avatars');

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export function ensureAvatarUploadDir(): void {
  if (!existsSync(AVATAR_UPLOAD_DIR)) {
    mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
  }
}

export const avatarMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      ensureAvatarUploadDir();
      cb(null, AVATAR_UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.jpg';
      cb(null, `${randomUUID()}${safeExt}`);
    },
  }),
};
