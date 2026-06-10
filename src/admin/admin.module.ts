import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ProvincesModule } from '../provinces/provinces.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CommunityModule } from '../community/community.module';

@Module({
  imports: [ProvincesModule, BookingsModule, CommunityModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
