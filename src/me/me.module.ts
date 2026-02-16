import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [PrismaModule, CouponsModule],
  controllers: [MeController],
})
export class MeModule {}
