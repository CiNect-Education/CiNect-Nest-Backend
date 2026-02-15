import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { HoldExpirationScheduler } from './hold-expiration.scheduler';

@Module({
  providers: [WebsocketGateway, HoldExpirationScheduler],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}
