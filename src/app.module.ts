import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MoviesModule } from './movies/movies.module';
import { CinemasModule } from './cinemas/cinemas.module';
import { ShowtimesModule } from './showtimes/showtimes.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { MembershipModule } from './membership/membership.module';
import { GiftsModule } from './gifts/gifts.module';
import { PromotionsModule } from './promotions/promotions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NewsModule } from './news/news.module';
import { SnacksModule } from './snacks/snacks.module';
import { SupportModule } from './support/support.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WebsocketModule } from './websocket/websocket.module';
import { HealthModule } from './health/health.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'development-secret-change-in-production',
      signOptions: {
        expiresIn: parseInt(process.env.JWT_ACCESS_SECONDS ?? '900', 10),
      },
    }),
    PrismaModule,
    AuthModule,
    MoviesModule,
    CinemasModule,
    ShowtimesModule,
    BookingsModule,
    PaymentsModule,
    MembershipModule,
    GiftsModule,
    PromotionsModule,
    NotificationsModule,
    NewsModule,
    SnacksModule,
    SupportModule,
    AdminModule,
    AnalyticsModule,
    WebsocketModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    {
      provide: APP_INTERCEPTOR,
      useFactory: (prisma: PrismaService) => new AuditInterceptor(prisma),
      inject: [PrismaService],
    },
  ],
})
export class AppModule {}
