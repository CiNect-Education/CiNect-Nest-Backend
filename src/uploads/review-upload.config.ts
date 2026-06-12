import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';

export const REVIEW_UPLOAD_DIR = join(process.cwd(), 'uploads', 'reviews');

export function ensureReviewUploadDir() {
  if (!existsSync(REVIEW_UPLOAD_DIR)) {
    mkdirSync(REVIEW_UPLOAD_DIR, { recursive: true });
  }
}

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export const reviewMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      ensureReviewUploadDir();
      cb(null, REVIEW_UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
      cb(new BadRequestException('Only JPG, PNG, WEBP images are allowed'), false);
      return;
    }
    cb(null, true);
  },
};
