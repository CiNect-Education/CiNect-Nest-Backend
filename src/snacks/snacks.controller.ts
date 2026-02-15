import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SnacksService } from './snacks.service';
import { Public } from '../common/decorators/public.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('snacks')
@Controller('snacks')
@Public()
export class SnacksController {
  constructor(private readonly snacksService: SnacksService) {}

  @Get()
  findAll() {
    return this.snacksService.findAll();
  }

  @Get('cinema/:cinemaId')
  findByCinema(@Param('cinemaId', ParseUuidPipe) cinemaId: string) {
    return this.snacksService.findByCinema(cinemaId);
  }
}
