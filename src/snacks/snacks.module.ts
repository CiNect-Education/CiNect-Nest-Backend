import { Module } from '@nestjs/common';
import { SnacksController } from './snacks.controller';
import { SnacksService } from './snacks.service';

@Module({
  controllers: [SnacksController],
  providers: [SnacksService],
  exports: [SnacksService],
})
export class SnacksModule {}
