import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ensureAvatarUploadDir } from './uploads/avatar-upload.config';
import { ensureReviewUploadDir } from './uploads/review-upload.config';

async function bootstrap() {
  ensureAvatarUploadDir();
  ensureReviewUploadDir();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  const isDev = process.env.NODE_ENV !== 'production';

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (isDev) {
        try {
          const { hostname, protocol } = new URL(origin);
          if (
            (hostname === 'localhost' || hostname === '127.0.0.1') &&
            (protocol === 'http:' || protocol === 'https:')
          ) {
            callback(null, true);
            return;
          }
        } catch {
          // fall through
        }
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const config = new DocumentBuilder()
    .setTitle('CiNect API')
    .setDescription('Cinema booking platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port);

  console.log(`CiNect API running on http://localhost:${port}/api/v1`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
