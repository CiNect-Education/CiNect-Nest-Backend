import { Module } from '@nestjs/common';
import { ShowtimesController } from './showtimes.controller';
import { ShowtimesService } from './showtimes.service';
import { ProvincesModule } from '../provinces/provinces.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [ProvincesModule, BookingsModule],
  controllers: [ShowtimesController],
  providers: [ShowtimesService],
  exports: [ShowtimesService],
})
export class ShowtimesModule {}
