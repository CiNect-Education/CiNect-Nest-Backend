import { Controller, Post, Delete, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HoldsService } from './holds.service';
import { CreateHoldDto } from './dto/create-hold.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('holds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('holds')
export class HoldsController {
  constructor(private readonly holdsService: HoldsService) {}

  @Post()
  create(@Body() dto: CreateHoldDto, @CurrentUser('id') userId: string) {
    return this.holdsService.create(dto.showtimeId, userId, dto.seatIds, dto.ticketLines);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.holdsService.findOne(id, userId);
  }

  @Delete(':id')
  release(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.holdsService.release(id, userId);
  }
}
