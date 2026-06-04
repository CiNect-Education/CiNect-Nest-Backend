import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { HoldsController } from './holds.controller';
import { HoldsService } from './holds.service';
import { TicketProductsService } from './ticket-products.service';
import { PricingService } from '../common/services/pricing.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  controllers: [BookingsController, HoldsController],
  providers: [BookingsService, HoldsService, TicketProductsService, PricingService],
  exports: [BookingsService, HoldsService, TicketProductsService],
})
export class BookingsModule {}
